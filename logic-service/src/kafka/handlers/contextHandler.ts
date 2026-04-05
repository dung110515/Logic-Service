/**
 * Context Handler - Xử Lý Câu Hỏi Q&A Từ Discord
 * ================================================
 * 
 * Mục đích:
 * - Nhận TICKET_CREATED message (Q&A question) từ Discord
 * - Tạo Ticket record trong database
 * - Fetch course context (documents, assignments, solutions)
 * - Gửi request tới AI Service để trả lời
 * - Cache Q&A để tránh gọi AI nhiều lần với câu hỏi tương tự
 * 
 * Message Flow:
 * Discord User: !ask "What is the capital of France?"
 *   └── Discord Proxy Service
 *       └── TICKET_CREATED message (Kafka)
 *           └── Logic Service (this handler)
 *               ├── Create Ticket record
 *               ├── Fetch course context (docs, assignments)
 *               ├── Publish AI_ANSWER_TICKET request
 *               └── Cache question hash
 * 
 * Kafka Message Format:
 * {
 *   "messageId": "msg-555",
 *   "timestamp": "2024-01-15T13:30:00Z",
 *   "source": "discord-proxy",
 *   "data": {
 *     "ticketId": "ticket-001",
 *     "studentId": "user-456",
 *     "courseId": "course-001",
 *     "question": "How do I solve problem 3.2?",
 *     "askedAt": "2024-01-15T13:25:00Z"
 *   }
 * }
 * 
 * Database Schema:
 * Ticket {
 *   id: String
 *   courseId: String (FK)
 *   studentId: String (FK)
 *   question: String
 *   answer: String (nullable, filled by AI)
 *   status: "OPEN" | "ANSWERED" | "CLOSED"
 *   createdAt: DateTime
 * }
 * 
 * Context Service Flow:
 * getStudentCourseContext() returns:
 * {
 *   course: {name, code},
 *   documents: [{id, title, fileUrl, summary}],
 *   assignments: [{id, title, deadline, rubricUrl}],
 *   students: [{id, name, email}]
 * }
 * 
 * AI Service Uses Context For:
 * 1. Know course content (what document to reference)
 * 2. Know upcoming deadlines ("assignment due tomorrow")
 * 3. Reference examples from documents
 * 4. Provide contextual answers (not generic)
 * 
 * Caching Strategy:
 * - Store Q&A cache with question hash as key
 * - TTL: 24 hours (questions are usually course-specific)
 * - Invalidate when: new document uploaded, assignment changes
 * 
 * Error Handling:
 * - Invalid payload → log warning, skip
 * - Context fetch fails → log warning, publish without context
 * - Ticket create fails → log error, don't throw
 * - Redis down → skip caching, still process question
 * 
 * Dùng bởi: kafkaConsumer (subscribes to TICKET_CREATED topic)
 */

import { TicketCreatedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishAIAnswerTicket } from '../producer';
import { getRedisClient, isRedisConnected } from '../../lib/redis';
import { getStudentCourseContext } from '../../services/contextService';

/**
 * Xử Lý Ticket Q&A Được Tạo
 * =========================
 * 
 * Workflow:
 * 1. Validate payload (check question, course, student)
 * 2. Check Redis cache for similar question (optimization)
 * 3. Create Ticket record in DB
 * 4. Fetch course context (documents, assignments)
 * 5. Publish AI_ANSWER_TICKET request với context
 * 6. Log result
 * 
 * @param payload - TicketCreatedPayload từ Kafka
 *   - messageId: unique message ID
 *   - timestamp: khi message được tạo
 *   - source: "discord-proxy"
 *   - data: ticket info
 *     - ticketId: ticket ID từ Discord
 *     - studentId: người hỏi
 *     - courseId: khóa học
 *     - question: câu hỏi
 * 
 * @example
 * // Kafka message từ Discord:
 * const payload = {
 *   messageId: 'msg-555',
 *   timestamp: '2024-01-15T13:30:00Z',
 *   source: 'discord-proxy',
 *   data: {
 *     ticketId: 'ticket-001',
 *     studentId: 'user-456',
 *     courseId: 'course-001',
 *     question: 'How do I solve problem 3.2?'
 *   }
 * };
 * 
 * // Handler processes:
 * await handleTicketCreated(payload);
 * // ✅ Ticket saved to DB
 * // ✅ Course context fetched
 * // ✅ AI request published
 */
export const handleTicketCreated = async (
  payload: TicketCreatedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(
      `🔄 Processing question ticket: ${data.ticketId} from student ${data.studentId} in course ${data.courseId}`
    );

    // ===== Step 1: Validate Payload =====
    // Check required fields: ticketId, studentId, courseId, question
    if (!data.ticketId || !data.studentId || !data.courseId || !data.question) {
      console.warn('⚠️ Invalid ticket payload (missing required fields):', {
        ticketId: data.ticketId,
        studentId: data.studentId,
        courseId: data.courseId,
        hasQuestion: !!data.question,
      });
      return; // Skip
    }

    // ===== Step 2: Check Redis Cache (Optional) =====
    // Optimization: check if similar question was already answered
    // Use question hash as key (không store full question để privacy)
    let cachedAnswer = null;
    if (isRedisConnected()) {
      const redis = getRedisClient();
      // Create hash từ question (base64 + truncate to 50 chars)
      const questionHash = Buffer.from(data.question).toString('base64').substring(0, 50);
      const cacheKey = `qa:${data.courseId}:${questionHash}`;
      cachedAnswer = await redis.get(cacheKey);

      if (cachedAnswer) {
        console.log(`✅ Found cached answer for similar question`);
        // TODO: Could use cached response for faster reply
      }
    }

    // ===== Step 3: Create Ticket Record =====
    // Save question vào DB (status: OPEN, waiting for AI answer)
    const ticket = await prisma.ticket.create({
      data: {
        courseId: data.courseId,
        studentId: data.studentId,
        question: data.question,
        status: 'OPEN', // Waiting for AI to answer
      },
    });

    console.log(`✅ Ticket saved to database:`, {
      id: ticket.id,
      courseId: data.courseId,
      studentId: data.studentId,
    });

    // ===== Step 4: Fetch Course Context =====
    // Lấy context để AI có context khi trả lời
    // Context bao gồm: documents, assignments, classmates
    try {
      const context = await getStudentCourseContext(data.studentId, data.courseId);
      console.log(`✅ Course context fetched for course ${data.courseId}`);

      // ===== Step 5a: Publish AI Request WITH Context =====
      // Gửi question + context tới AI Service
      // AI sẽ sử dụng context để trả lời cụ thể (refer documents, etc)
      const contextStr = JSON.stringify(context);
      await publishAIAnswerTicket({
        source: 'logic-service',
        data: {
          ticketId: ticket.id,
          question: data.question,
          courseContext: contextStr,
        },
      });

      console.log(`📤 AI answer request published with context for ticket ${ticket.id}`);
    } catch (contextError) {
      // If context fetch fails, still publish request but without context
      console.warn('⚠️ Could not fetch course context, publishing without it:', contextError);

      // ===== Step 5b: Publish AI Request WITHOUT Context (Fallback) =====
      // Fallback: publish request với empty context
      // AI sẽ trả lời generic answer (không course-specific)
      await publishAIAnswerTicket({
        source: 'logic-service',
        data: {
          ticketId: ticket.id,
          question: data.question,
          courseContext: '{}', // Empty context
        },
      });

      console.log(`📤 AI answer request published (without context)`);
    }

    console.log(`✅ Ticket processed successfully:`, {
      ticketId: ticket.id,
      studentId: data.studentId,
      courseId: data.courseId,
      questionLength: data.question.length,
    });
  } catch (error) {
    // ===== Error Handling =====
    // Log error nhưng don't throw (keep consumer running)
    console.error('❌ Error in contextHandler:', error);
    // Don't throw - continue to next message
  }
};

export default handleTicketCreated;
