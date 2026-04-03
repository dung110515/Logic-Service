/**
 * Quiz Handler
 * Xử lý: WEB_QUIZ_SUBMITTED message từ Web Service
 * 
 * Workflow:
 * 1. Nhận câu trả lời quiz từ Web Service
 * 2. Tạo QuizResult record trong DB
 * 3. Chấm điểm (tự động hoặc gửi AI)
 * 4. Báo Analytics Service
 * 5. Notify sinh viên về kết quả
 */

import { WebQuizSubmittedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishNotification } from '../producer';

export const handleWebQuizSubmitted = async (
  payload: WebQuizSubmittedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing quiz submission: ${data.submissionId} from ${data.studentId}`);

    // ===== Validate payload =====
    if (!data.submissionId || !data.studentId || !data.quizId) {
      console.warn('⚠️ Invalid quiz submission payload:', data);
      return;
    }

    // ===== Get quiz details =====
    const quiz = await prisma.quiz.findUnique({
      where: { id: data.quizId },
      select: {
        id: true,
        title: true,
        questionsJson: true,
      },
    });

    if (!quiz) {
      console.warn(`⚠️ Quiz not found: ${data.quizId}`);
      return;
    }

    // ===== Calculate score (auto-grade multiple choice) =====
    let score = 0;
    try {
      const questions = Array.isArray(quiz.questionsJson) ? quiz.questionsJson : JSON.parse(quiz.questionsJson as string);
      // Count correct answers from submitted data
      Object.entries(data.answers).forEach(([questionIndex, answer]) => {
        const q = questions[parseInt(questionIndex)];
        if (q && q.correctAnswer === answer) {
          score++;
        }
      });
    } catch (e) {
      console.warn('⚠️ Could not auto-grade quiz:', e);
      score = 0;
    }

    // ===== Create QuizResult record =====
    const quizResult = await prisma.quizResult.create({
      data: {
        studentId: data.studentId,
        quizId: data.quizId,
        answersJson: JSON.stringify(data.answers),
        score,
      },
    });

    console.log(`✅ Quiz result saved: ${quizResult.id}`);

    // ===== Notify Student =====
    await publishNotification({
      source: 'logic-service',
      data: {
        userId: data.studentId,
        title: 'Kết Quả Quiz',
        content: `Quiz "${quiz.title}" của bạn đã được chấm: ${score} câu đúng`,
      },
    });

    console.log('✅ Quiz submission processed:', {
      quizResultId: quizResult.id,
      studentId: data.studentId,
      score,
    });
  } catch (error) {
    console.error('❌ Error in quizHandler:', error);
    // Không throw - để consumer tiếp tục xử lý messages tiếp theo
  }
};

export default handleWebQuizSubmitted;
