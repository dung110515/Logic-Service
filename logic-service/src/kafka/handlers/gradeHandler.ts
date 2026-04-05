import { AIResponseGradePayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishProcessGrade, publishNotification } from '../producer';

export const handleAIResponseGrade = async (
  payload: AIResponseGradePayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing grade for submission: ${data.submissionId}`);

    if (!data.submissionId || data.score === undefined) {
      console.warn('⚠️ Invalid grade payload (missing required fields):', {
        submissionId: data.submissionId,
        score: data.score,
      });
      return;
    }

    const submission = await prisma.submission.findUnique({
      where: { id: data.submissionId },
      include: {
        assignment: {
          include: {
            course: true,
          },
        },
      },
    });

    if (!submission) {
      console.warn(`⚠️ Submission not found: ${data.submissionId}`);
      return;
    }

    const grade = await prisma.grade.create({
      data: {
        submissionId: data.submissionId,
        score: data.score,
        comment: data.feedback || '',
        gradedById: 'ai-system',
      },
    });

    console.log(`✅ Grade created:`, {
      id: grade.id,
      score: data.score,
      submissionId: data.submissionId,
    });

    await prisma.submission.update({
      where: { id: data.submissionId },
      data: { status: 'GRADED' },
    });

    console.log(`✅ Submission marked as GRADED`);

    await publishProcessGrade({
      source: 'logic-service',
      data: {
        gradeId: grade.id,
        studentId: submission.studentId,
        assignmentId: submission.assignmentId,
        courseId: submission.assignment.courseId,
        score: data.score,
        maxScore: submission.assignment.maxScore,
        gradedAt: new Date().toISOString(),
      },
    });

    await publishNotification({
      source: 'logic-service',
      data: {
        userId: submission.studentId,
        title: 'Điểm Bài Tập',
        content: `Bài tập "${submission.assignment.title}" đã được chấm: ${data.score}/${submission.assignment.maxScore}`,

      },
    });

    console.log(`✅ Grade processed successfully:`, {
      gradeId: grade.id,
      studentId: submission.studentId,
      assignmentId: submission.assignmentId,
      courseId: submission.assignment.courseId,
      score: data.score,
      maxScore: submission.assignment.maxScore,
    });
  } catch (error) {

    console.error('❌ Error in gradeHandler:', error);

  }
};

export default handleAIResponseGrade;
