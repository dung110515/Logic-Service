/**
 * Submission Handler
 * Xử lý: SUBMISSION_CREATED message từ Discord Proxy Service
 * 
 * Workflow:
 * 1. Nhận thông tin nộp bài từ Discord
 * 2. Tạo Submission record trong DB
 * 3. Báo Analytics Service biết có submission mới
 * 4. Cache thông tin submission
 */

import { SubmissionCreatedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishProcessSubmission } from '../producer';

export const handleSubmissionCreated = async (
  payload: SubmissionCreatedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing submission: ${data.submissionId} from ${data.studentId}`);

    // ===== Validate payload =====
    if (!data.submissionId || !data.studentId || !data.assignmentId) {
      console.warn('⚠️ Invalid submission payload:', data);
      return;
    }

    // ===== Save to Database =====
    const submission = await prisma.submission.create({
      data: {
        assignmentId: data.assignmentId,
        studentId: data.studentId,
        fileUrl: data.fileUrl || data.submissionId, // Use fileUrl if provided, else use submissionId
        status: 'PENDING', // Initial status
      },
    });

    console.log(`✅ Submission saved: ${submission.id}`);

    // ===== Publish Analytics Event =====
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

    console.log('✅ Submission processed:', {
      submissionId: submission.id,
      studentId: data.studentId,
      assignmentId: data.assignmentId,
      courseId: data.courseId,
    });
  } catch (error) {
    console.error('❌ Error in submissionHandler:', error);
    // Không throw - để consumer tiếp tục xử lý messages tiếp theo
  }
};

export default handleSubmissionCreated;
