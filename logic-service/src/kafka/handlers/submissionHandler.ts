import { SubmissionCreatedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishProcessSubmission } from '../producer';

export const handleSubmissionCreated = async (
  payload: SubmissionCreatedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing submission: ${data.submissionId} from student ${data.studentId}`);

    if (!data.submissionId || !data.studentId || !data.assignmentId) {
      console.warn('⚠️ Invalid submission payload (missing required fields):', {
        submissionId: data.submissionId,
        studentId: data.studentId,
        assignmentId: data.assignmentId,
      });
      return;
    }

    const submission = await prisma.submission.create({
      data: {
        assignmentId: data.assignmentId,
        studentId: data.studentId,
        fileUrl: data.fileUrl || data.submissionId,
        status: 'PENDING',
      },
    });

    console.log(`✅ Submission saved to database:`, {
      id: submission.id,
      assignmentId: data.assignmentId,
      studentId: data.studentId,
    });

    await publishProcessSubmission({
      source: 'logic-service',
      data: {
        submissionId: submission.id,
        studentId: data.studentId,
        assignmentId: data.assignmentId,
        courseId: data.courseId,
        processedAt: new Date().toISOString(),
      },
    });

    console.log(`✅ Submission processed successfully:`, {
      dbSubmissionId: submission.id,
      discordSubmissionId: data.submissionId,
      studentId: data.studentId,
      assignmentId: data.assignmentId,
      courseId: data.courseId,
    });
  } catch (error) {

    console.error('❌ Error in submissionHandler:', error);

  }
};

export default handleSubmissionCreated;
