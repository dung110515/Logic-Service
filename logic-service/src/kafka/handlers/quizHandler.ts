import { WebQuizSubmittedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishNotification } from '../producer';

export const handleWebQuizSubmitted = async (
  payload: WebQuizSubmittedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing quiz submission: ${data.submissionId} from student ${data.studentId}`);

    if (!data.submissionId || !data.studentId || !data.quizId) {
      console.warn('⚠️ Invalid quiz submission payload (missing required fields):', {
        submissionId: data.submissionId,
        studentId: data.studentId,
        quizId: data.quizId,
      });
      return;
    }

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

    let score = 0;
    try {

      const questions = Array.isArray(quiz.questionsJson)
        ? quiz.questionsJson
        : JSON.parse(quiz.questionsJson as string);

      Object.entries(data.answers).forEach(([questionIndex, answer]) => {
        const q = questions[parseInt(questionIndex)];
        if (q && q.correctAnswer === answer) {
          score++;
        }
      });

      console.log(`🔢 Auto-graded quiz: ${score}/${questions.length} correct`);
    } catch (e) {

      console.warn('⚠️ Could not auto-grade quiz (JSON parse error):', e);
      score = 0;
    }

    const quizResult = await prisma.quizResult.create({
      data: {
        studentId: data.studentId,
        quizId: data.quizId,
        answersJson: JSON.stringify(data.answers),
        score,
      },
    });

    console.log(`✅ Quiz result saved to database:`, {
      id: quizResult.id,
      studentId: data.studentId,
      quizId: data.quizId,
      score,
    });

    await publishNotification({
      source: 'logic-service',
      data: {
        userId: data.studentId,
        title: 'Kết Quả Quiz',
        content: `Quiz "${quiz.title}" của bạn đã được chấm: ${score} câu đúng`,
      },
    });

    console.log(`✅ Quiz submission processed successfully:`, {
      quizResultId: quizResult.id,
      studentId: data.studentId,
      quizTitle: quiz.title,
      score,
      totalQuestions: 'See quiz.questionsJson for count',
    });
  } catch (error) {

    console.error('❌ Error in quizHandler:', error);

  }
};

export default handleWebQuizSubmitted;
