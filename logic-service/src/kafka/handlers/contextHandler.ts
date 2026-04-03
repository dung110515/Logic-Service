/**
 * Context Handler
 * Xử lý: TICKET_CREATED message từ Discord Proxy Service
 * 
 * Workflow:
 * 1. Nhận câu hỏi Q&A mới từ Discord
 * 2. Tạo Ticket record trong DB
 * 3. Tìm context (course content, documents, ...)
 * 4. Gửi request tới AI Service để trả lời
 * 5. Cache question hash để tránh gọi AI lặp lại
 */

import { TicketCreatedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishAIAnswerTicket } from '../producer';
import { getRedisClient, isRedisConnected } from '../../lib/redis';
import { getStudentCourseContext } from '../../services/contextService';

export const handleTicketCreated = async (
  payload: TicketCreatedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(
      `🔄 Processing ticket: ${data.ticketId} from ${data.studentId}`
    );

    // ===== Validate payload =====
    if (!data.ticketId || !data.studentId || !data.courseId || !data.question) {
      console.warn('⚠️ Invalid ticket payload:', data);
      return;
    }

    // ===== Check cache for similar question =====
    let cachedAnswer = null;
    if (isRedisConnected()) {
      const redis = getRedisClient();
      // Create a hash of the question for caching
      const questionHash = Buffer.from(data.question).toString('base64').substring(0, 50);
      const cacheKey = `qa:${data.courseId}:${questionHash}`;
      cachedAnswer = await redis.get(cacheKey);

      if (cachedAnswer) {
        console.log(`✅ Found cached answer for question hash: ${questionHash}`);
        // Publish cached response (optional optimization for fast response)
      }
    }

    // ===== Create Ticket record =====
    const ticket = await prisma.ticket.create({
      data: {
        courseId: data.courseId,
        studentId: data.studentId,
        question: data.question,
        status: 'OPEN',
      },
    });

    console.log(`✅ Ticket saved: ${ticket.id}`);

    // ===== Get Course Context for AI =====
    try {
      const context = await getStudentCourseContext(data.studentId, data.courseId);
      console.log(`✅ Context fetched for course ${data.courseId}`);

      // ===== Publish AI Request =====
      const contextStr = JSON.stringify(context);
      await publishAIAnswerTicket({
        source: 'logic-service',
        data: {
          ticketId: ticket.id,
          question: data.question,
          courseContext: contextStr,
        },
      });

      console.log(`📤 AI answer request published for ticket ${ticket.id}`);
    } catch (error) {
      console.warn('⚠️ Could not build context, publishing without context:', error);
      // Still publish request, but with empty context
      await publishAIAnswerTicket({
        source: 'logic-service',
        data: {
          ticketId: ticket.id,
          question: data.question,
          courseContext: '{}',
        },
      });
    }

    console.log('✅ Ticket processed:', {
      ticketId: ticket.id,
      studentId: data.studentId,
      courseId: data.courseId,
    });
  } catch (error) {
    console.error('❌ Error in contextHandler:', error);
    // Không throw - để consumer tiếp tục xử lý messages tiếp theo
  }
};

export default handleTicketCreated;
