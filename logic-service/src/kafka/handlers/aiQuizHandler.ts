/**
 * AI Quiz Handler - Xử Lý Quiz Tạo Từ AI Service
 * =================================================
 * 
 * Mục đích:
 * - Nhận AI_RESPONSE_QUIZ message từ AI Service
 * - Lưu quiz được AI tạo vào database
 * - Link questions với Quiz record
 * - Notify giáo viên quiz sẵn sàng để kiểm tra/phát hành
 * 
 * Message Flow:
 * Teacher / Command Handler
 *   └── /generate_quiz {document_id}
 *       └── Publish GENERATE_QUIZ_REQUEST
 *           └── AI Service
 *               └── Reads document, generates questions
 *                   └── AI_RESPONSE_QUIZ message (Kafka)
 *                       └── Logic Service (this handler)
 *                           ├── Create/Update Quiz record
 *                           ├── Save questions as JSON
 *                           ├── Set status to DRAFT
 *                           └── Notify teacher
 * 
 * Kafka Message Format:
 * {
 *   "messageId": "msg-111",
 *   "timestamp": "2024-01-15T12:00:00Z",
 *   "source": "ai-service",
 *   "data": {
 *     "quizId": "quiz-001",
 *     "courseId": "course-001",
 *     "documentId": "doc-123",  (optional)
 *     "createdBy": "user-789",  (teacher ID)
 *     "questions": [
 *       {
 *         "id": "q1",
 *         "text": "What is the capital of France?",
 *         "options": ["Paris", "London", "Berlin"],
 *         "correctAnswer": "Paris",
 *         "difficulty": "easy"
 *       },
 *       ...
 *     ]
 *   }
 * }
 * 
 * Database Schema:
 * Quiz {
 *   id: String
 *   courseId: String (FK)
 *   documentId: String (optional FK) - quiz based on document
 *   title: String
 *   questionsJson: String (JSON array of questions)
 *   status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
 *   timeLimitMins: Int (default 15)
 *   createdAt: DateTime
 *   updatedAt: DateTime
 * }
 * 
 * Workflow:
 * 1. AI tạo questions từ document
 * 2. Handler saves quiz (status: DRAFT)
 * 3. Teacher reviews quiz trước khi publish
 * 4. Teacher publishes → students can take quiz
 * 5. Grades saved → stats updated
 * 
 * Error Handling:
 * - Invalid payload (missing questions) → log warning, skip
 * - DB error (unique constraint) → log error, don't throw
 * - Notification error → log error, continue (quiz still saved)
 * 
 * Dùng bởi: kafkaConsumer (subscribes to AI_RESPONSE_QUIZ topic)
 */

import { AIResponseQuizPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishNotification } from '../producer';

/**
 * Xử Lý Quiz Được AI Tạo
 * ======================
 * 
 * Workflow:
 * 1. Validate payload (check questions exist)
 * 2. Find or create Quiz record
 * 3. Save questions as JSON
 * 4. Set status to DRAFT (teacher review before publish)
 * 5. Notify teacher
 * 6. Log result
 * 
 * @param payload - AIResponseQuizPayload từ Kafka
 *   - messageId: unique message ID
 *   - timestamp: khi message được tạo
 *   - source: "ai-service"
 *   - data: quiz info từ AI
 *     - quizId: auto-generated quiz ID
 *     - courseId: khóa học
 *     - questions: array of question objects
 *     - createdBy: teacher ID (để notify)
 * 
 * @example
 * // Kafka message từ AI Service:
 * const payload = {
 *   messageId: 'msg-111',
 *   timestamp: '2024-01-15T12:00:00Z',
 *   source: 'ai-service',
 *   data: {
 *     quizId: 'quiz-001',
 *     courseId: 'course-001',
 *     createdBy: 'teacher-123',
 *     questions: [
 *       {id: 'q1', text: 'Q1?', options: [...]...},
 *       {id: 'q2', text: 'Q2?', options: [...]...},
 *     ]
 *   }
 * };
 * 
 * // Handler processes:
 * await handleAIResponseQuiz(payload);
 * // ✅ Quiz saved with 2 questions
 * // ✅ Teacher notified
 */
export const handleAIResponseQuiz = async (
  payload: AIResponseQuizPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing AI-generated quiz: ${data.quizId}`);

    // ===== Step 1: Validate Payload =====
    // Check: quizId, courseId, questions array not empty
    if (!data.quizId || !data.courseId || !data.questions || data.questions.length === 0) {
      console.warn('⚠️ Invalid quiz payload (missing required fields):', {
        quizId: data.quizId,
        courseId: data.courseId,
        questionCount: data.questions?.length,
      });
      return; // Skip
    }

    // ===== Step 2: Find or Create Quiz =====
    // Check if quiz already exists (update case) or create new
    let quiz = await prisma.quiz.findUnique({
      where: { id: data.quizId },
    });

    if (!quiz) {
      // New quiz: create record
      quiz = await prisma.quiz.create({
        data: {
          id: data.quizId,
          courseId: data.courseId,
          documentId: '', // AI-generated quiz may not be based on specific document
          title: `Auto-generated Quiz - ${new Date().toLocaleDateString('vi-VN')}`, // Vietnamese date format
          questionsJson: JSON.stringify(data.questions) as any, // Store questions as JSON
          status: 'DRAFT', // Initially DRAFT so teacher can review before publishing
          timeLimitMins: 15, // Default 15 minute time limit
        },
      });

      console.log(`✅ New quiz created:`, {
        id: quiz.id,
        courseId: data.courseId,
        questionCount: data.questions.length,
      });
    } else {
      // Update existing quiz: refresh questions
      quiz = await prisma.quiz.update({
        where: { id: data.quizId },
        data: {
          questionsJson: JSON.stringify(data.questions) as any,
          status: 'DRAFT', // Reset to DRAFT for review
        },
      });

      console.log(`✅ Quiz updated:`, {
        id: quiz.id,
        questionCount: data.questions.length,
      });
    }

    // ===== Step 3: Notify Teacher =====
    // Báo teacher biết quiz AI tạo được sẵn sàng
    // Teacher cần review câu hỏi trước khi phát hành cho students
    await publishNotification({
      source: 'logic-service',
      data: {
        userId: data.createdBy, // Teacher ID
        title: 'Quiz Tự Động', // Auto-generated Quiz
        content: `Quiz được AI tạo đã sẵn sàng với ${data.questions.length} câu hỏi. Hãy kiểm tra và phát hành.`,
        // translates to: "AI-generated quiz is ready with X questions. Please review and publish."
      },
    });

    console.log(`✅ AI Quiz processed successfully:`, {
      quizId: quiz.id,
      courseId: data.courseId,
      questionCount: data.questions.length,
      status: 'DRAFT (awaiting teacher review)',
      notifiedTeacher: data.createdBy,
    });
  } catch (error) {
    // ===== Error Handling =====
    // Log error but don't throw (keep consumer running)
    console.error('❌ Error in aiQuizHandler:', error);
    // Don't throw - continue to next message
  }
};

export default handleAIResponseQuiz;
