/**
 * Grade Handler
 * Xử lý: AI_RESPONSE_GRADE message từ AI Service
 * 
 * Workflow:
 * 1. Nhận điểm và feedback từ AI Service
 * 2. Tạo Grade record trong DB
 * 3. Báo Analytics Service biết có grade mới
 * 4. Notify sinh viên về điểm số
 * 5. Update cache
 */

import { AIResponseGradePayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishProcessGrade, publishNotification } from '../producer';

export const handleAIResponseGrade = async (
  payload: AIResponseGradePayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing grade: ${data.gradeId} for submission ${data.submissionId}`);

    // ===== Validate payload =====
    if (!data.submissionId || data.score === undefined) {
      console.warn('⚠️ Invalid grade payload:', data);
      return;
    }

    // ===== Get submission and related data =====
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

    // ===== Create Grade record =====
    const grade = await prisma.grade.create({
      data: {
        submissionId: data.submissionId,
        score: data.score,
        comment: data.feedback,
        gradedById: 'ai-system', // AI system ID
      },
    });

    // ===== Update submission status =====
    await prisma.submission.update({
      where: { id: data.submissionId },
      data: { status: 'GRADED' },
    });

    console.log(`✅ Grade saved: ${grade.id}`);

    // ===== Publish Analytics Event =====
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

    // ===== Notify Student =====
    await publishNotification({
      source: 'logic-service',
      data: {
        userId: submission.studentId,
        title: 'Điểm Bài Tập',
        content: `Bài tập "${submission.assignment.title}" đã được chấm: ${data.score}/${submission.assignment.maxScore}`,
      },
    });

    console.log('✅ Grade processed:', {
      gradeId: grade.id,
      studentId: submission.studentId,
      score: data.score,
    });
  } catch (error) {
    console.error('❌ Error in gradeHandler:', error);
    // Không throw - để consumer tiếp tục xử lý messages tiếp theo
  }
};

export default handleAIResponseGrade;
