import { AIResponseQuizPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishNotification } from '../producer';

export const handleAIResponseQuiz = async (
  payload: AIResponseQuizPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing AI-generated quiz: ${data.quizId}`);

    if (!data.quizId || !data.courseId || !data.questions || data.questions.length === 0) {
      console.warn('⚠️ Invalid quiz payload (missing required fields):', {
        quizId: data.quizId,
        courseId: data.courseId,
        questionCount: data.questions?.length,
      });
      return;
    }

    let quiz = await prisma.quiz.findUnique({
      where: { id: data.quizId },
    });

    if (!quiz) {

      quiz = await prisma.quiz.create({
        data: {
          id: data.quizId,
          courseId: data.courseId,
          documentId: '',
          title: `Auto-generated Quiz - ${new Date().toLocaleDateString('vi-VN')}`,
          questionsJson: JSON.stringify(data.questions) as any,
          status: 'DRAFT',
          timeLimitMins: 15,
        },
      });

      console.log(`✅ New quiz created:`, {
        id: quiz.id,
        courseId: data.courseId,
        questionCount: data.questions.length,
      });
    } else {

      quiz = await prisma.quiz.update({
        where: { id: data.quizId },
        data: {
          questionsJson: JSON.stringify(data.questions) as any,
          status: 'DRAFT',
        },
      });

      console.log(`✅ Quiz updated:`, {
        id: quiz.id,
        questionCount: data.questions.length,
      });
    }

    await publishNotification({
      source: 'logic-service',
      data: {
        userId: data.createdBy,
        title: 'Quiz Tự Động',
        content: `Quiz được AI tạo đã sẵn sàng với ${data.questions.length} câu hỏi. Hãy kiểm tra và phát hành.`,

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

    console.error('❌ Error in aiQuizHandler:', error);

  }
};

export default handleAIResponseQuiz;
