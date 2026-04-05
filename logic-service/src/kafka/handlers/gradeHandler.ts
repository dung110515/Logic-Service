/**
 * Grade Handler - Xử Lý Điểm Từ AI Service
 * ============================================
 * 
 * Mục đích:
 * - Nhận AI_RESPONSE_GRADE message từ AI Service
 * - Lưu grade vào database
 * - Báo Analytics Service biết có grade mới
 * - Notify sinh viên về kết quả chấm
 * 
 * Message Flow:
 * Logic Service (submissionHandler)
 *   └── Save Submission
 *       └── Publish PROCESS_SUBMISSION event
 *           └── AI Service
 *               └── Grades assignment (essay, code, etc)
 *                   └── AI_RESPONSE_GRADE message (Kafka)
 *                       └── Logic Service (this handler)
 *                           ├── Create Grade record
 *                           ├── Update Submission status
 *                           ├── Publish grade event
 *                           └── Notify student
 * 
 * Kafka Message Format:
 * {
 *   "messageId": "msg-999",
 *   "timestamp": "2024-01-15T11:15:00Z",
 *   "source": "ai-service",
 *   "data": {
 *     "gradeId": "grade-123",
 *     "submissionId": "sub-456",
 *     "score": 85,
 *     "feedback": "Good analysis, missing one example",
 *     "gradedAt": "2024-01-15T11:10:00Z"
 *   }
 * }
 * 
 * Database Schema:
 * Grade {
 *   id: String
 *   submissionId: String (FK to Submission)
 *   score: Int (0-100, can be decimal like 85.5)
 *   comment: String (feedback từ AI)
 *   gradedById: String (who graded: "ai-system" or userId for manual)
 *   createdAt: DateTime
 * }
 * 
 * Submission Status:
 * PENDING → (AI grades) → GRADED → (Student reads feedback) → REVIEWED
 * 
 * Error Handling:
 * - Invalid payload → log warning, skip
 * - Submission not found → log warning, skip  
 * - DB error → log error, don't throw
 * - Notification error → log error but continue (grading still succeeded)
 * 
 * Performance:
 * - Single DB create for Grade
 * - Single Submission update
 * - Single Kafka publish (analytics)
 * - Single Kafka publish (notification)
 * 
 * Dùng bởi: kafkaConsumer (subscribes to AI_RESPONSE_GRADE topic)
 */

import { AIResponseGradePayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishProcessGrade, publishNotification } from '../producer';

/**
 * Xử Lý Grade Từ AI Service
 * =========================
 * 
 * Workflow:
 * 1. Validate payload (check required fields)
 * 2. Fetch submission details (để lấy assignment, student info)
 * 3. Create Grade record
 * 4. Update submission status → GRADED
 * 5. Publish analytics event + notification
 * 6. Log kết quả
 * 
 * @param payload - AIResponseGradePayload từ Kafka
 *   - messageId: unique message ID
 *   - timestamp: khi message được tạo
 *   - source: "ai-service"
 *   - data: grade info từ AI
 *     - gradeId: AI-generated grade ID
 *     - submissionId: submission được grade
 *     - score: điểm (0-100)
 *     - feedback: AI's feedback/comments
 * 
 * @example
 * // Kafka message từ AI Service:
 * const payload = {
 *   messageId: 'msg-999',
 *   timestamp: '2024-01-15T11:15:00Z',
 *   source: 'ai-service',
 *   data: {
 *     gradeId: 'grade-123',
 *     submissionId: 'sub-456',
 *     score: 85,
 *     feedback: 'Good analysis, needs more examples'
 *   }
 * };
 * 
 * // Handler processes:
 * await handleAIResponseGrade(payload);
 * // ✅ Grade saved with score=85
 * // ✅ Submission marked as GRADED
 * // ✅ Student notified
 */
export const handleAIResponseGrade = async (
  payload: AIResponseGradePayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing grade for submission: ${data.submissionId}`);

    // ===== Step 1: Validate Payload =====
    // Check required fields: submissionId, score
    if (!data.submissionId || data.score === undefined) {
      console.warn('⚠️ Invalid grade payload (missing required fields):', {
        submissionId: data.submissionId,
        score: data.score,
      });
      return; // Skip
    }

    // ===== Step 2: Fetch Submission Details =====
    // Lấy submission + assignment info (để get student, assignment, course)
    const submission = await prisma.submission.findUnique({
      where: { id: data.submissionId },
      include: {
        assignment: {
          include: {
            course: true, // Get course info
          },
        },
      },
    });

    if (!submission) {
      console.warn(`⚠️ Submission not found: ${data.submissionId}`);
      return; // Skip - submission doesn't exist
    }

    // ===== Step 3: Create Grade Record =====
    // Lưu grade vào DB với:
    // - submissionId: link đến submission
    // - score: điểm từ AI (85, 92.5, etc)
    // - comment: feedback từ AI (ví dụ: "Good analysis")
    // - gradedById: "ai-system" (để track grader type)
    const grade = await prisma.grade.create({
      data: {
        submissionId: data.submissionId,
        score: data.score,
        comment: data.feedback || '', // AI feedback
        gradedById: 'ai-system', // System ID để identify AI-graded
      },
    });

    console.log(`✅ Grade created:`, {
      id: grade.id,
      score: data.score,
      submissionId: data.submissionId,
    });

    // ===== Step 4: Update Submission Status =====
    // Thay đổi status: PENDING → GRADED
    // Đây là signal cho student biết bài tập đã được chấm
    await prisma.submission.update({
      where: { id: data.submissionId },
      data: { status: 'GRADED' },
    });

    console.log(`✅ Submission marked as GRADED`);

    // ===== Step 5a: Publish Analytics Event =====
    // Báo Analytics Service biết có grade mới (để update stats, grade curve, etc)
    await publishProcessGrade({
      source: 'logic-service',
      data: {
        gradeId: grade.id,
        studentId: submission.studentId,
        assignmentId: submission.assignmentId,
        courseId: submission.assignment.courseId,
        score: data.score,
        maxScore: submission.assignment.maxScore, // For percentage calc
        gradedAt: new Date().toISOString(),
      },
    });

    // ===== Step 5b: Notify Student =====
    // Gửi notification để student biết:
    // 1. Bài tập đã được chấm
    // 2. Điểm số
    // 3. Feedback từ AI
    await publishNotification({
      source: 'logic-service',
      data: {
        userId: submission.studentId,
        title: 'Điểm Bài Tập', // Assignment Grade
        content: `Bài tập "${submission.assignment.title}" đã được chấm: ${data.score}/${submission.assignment.maxScore}`,
        // translates to: "Assignment  has been graded: {score}/{maxScore}"
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
    // ===== Error Handling =====
    // Log error nhưng don't throw (để consumer tiếp tục)
    console.error('❌ Error in gradeHandler:', error);
    // Don't throw - keep consumer running
  }
};

export default handleAIResponseGrade;
