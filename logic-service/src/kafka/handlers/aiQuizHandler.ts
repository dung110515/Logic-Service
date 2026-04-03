/**
 * AI Quiz Handler
 * Xử lý: AI_RESPONSE_QUIZ message từ AI Service
 * 
 * Workflow:
 * 1. Nhận quiz được AI tạo
 * 2. Lưu vào Quiz table
 * 3. Link questions với Quiz
 * 4. Cache quiz info
 * 5. Notify giáo viên quiz sẵn sàng
 */

import { AIResponseQuizPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishNotification } from '../producer';

export const handleAIResponseQuiz = async (
  payload: AIResponseQuizPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing AI quiz: ${data.quizId} for course ${data.courseId}`);

    // ===== Validate payload =====
    if (!data.quizId || !data.courseId || !data.questions || data.questions.length === 0) {
      console.warn('⚠️ Invalid quiz payload:', data);
      return;
    }

    // ===== Get document if available (quiz might be based on document) =====
    // For now, we'll create a quiz without explicit document link
    // The quiz is created in DRAFT status initially
    let quiz = await prisma.quiz.findUnique({
      where: { id: data.quizId },
    });

    if (!quiz) {
      // Create Quiz if doesn't exist
      quiz = await prisma.quiz.create({
        data: {
          id: data.quizId,
          courseId: data.courseId,
          documentId: '', // Will be updated if we know the document
          title: `Auto-generated Quiz - ${new Date().toLocaleDateString()}`,
          questionsJson: JSON.stringify(data.questions) as any,
          status: 'DRAFT', // Initially DRAFT, change to PUBLISHED when ready
          timeLimitMins: 15, // Default time limit
        },
      });
    } else {
      // Update existing quiz with questions
      quiz = await prisma.quiz.update({
        where: { id: data.quizId },
        data: {
          questionsJson: JSON.stringify(data.questions) as any,
          status: 'DRAFT',
        },
      });
    }

    console.log(`✅ Quiz saved: ${quiz.id}`);

    // ===== Notify Teacher =====
    await publishNotification({
      source: 'logic-service',
      data: {
        userId: data.createdBy,
        title: 'Quiz Tự Động',
        content: `Quiz được AI tạo đã sẵn sàng với ${data.questions.length} câu hỏi. Hãy kiểm tra và phát hành.`,
      },
    });

    console.log('✅ AI Quiz processed:', {
      quizId: quiz.id,
      courseId: data.courseId,
      questionCount: data.questions.length,
      createdBy: data.createdBy,
    });
  } catch (error) {
    console.error('❌ Error in aiQuizHandler:', error);
    // Không throw - để consumer tiếp tục xử lý messages tiếp theo
  }
};

export default handleAIResponseQuiz;
