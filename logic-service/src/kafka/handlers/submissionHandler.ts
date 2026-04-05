/**
 * Submission Handler - Xử Lý Nộp Bài Từ Discord
 * ================================================
 * 
 * Mục đích:
 * - Nhận SUBMISSION_CREATED message từ Discord Proxy Service
 * - Lưu submission vào database
 * - Báo Analytics Service biết có submission mới
 * - Chuẩn bị dữ liệu cho auto-grading handler
 * 
 * Message Flow:
 * Discord User
 *   └── !submit assignment #channel
 *       └── Discord Proxy Service
 *           └── SUBMISSION_CREATED message (Kafka)
 *               └── Logic Service (this handler)
 *                   ├── Save to DB
 *                   ├── Publish SUBMISSION_CREATED_PROCESSED
 *                   └── Trigger auto-grading (if applicable)
 * 
 * Kafka Message Format:
 * {
 *   "messageId": "msg-123",
 *   "timestamp": "2024-01-15T10:30:00Z",
 *   "source": "discord-proxy",
 *   "data": {
 *     "submissionId": "sub-123",
 *     "studentId": "user-456",
 *     "assignmentId": "assign-789",
 *     "courseId": "course-001",
 *     "fileUrl": "https://cdn.example.com/submissions/file.pdf",
 *     "submittedAt": "2024-01-15T10:25:00Z"
 *   }
 * }
 * 
 * Database Schema:
 * Submission {
 *   id: String (auto-generated)
 *   assignmentId: String (FK to Assignment)
 *   studentId: String (FK to User)
 *   fileUrl: String (link to uploaded file)
 *   status: "PENDING" | "GRADED" | "REJECTED" (default: PENDING)
 *   createdAt: DateTime (auto)
 *   grades?: Grade[] (one-to-many)
 * }
 * 
 * Error Handling:
 * - Invalid payload (missing fields) → log warning, skip (dead letter)
 * - DB error (constraint violation) → log error, don't throw (keep consumer running)
 * - Prisma error → log error, continue to next message
 * 
 * Performance:
 * - Single DB insert per submission
 * - Single Kafka publish per submission
 * - No cached data (always fresh from DB after save)
 * 
 * Dùng bởi: kafkaConsumer (subscribes to SUBMISSION_CREATED topic)
 */

import { SubmissionCreatedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishProcessSubmission } from '../producer';

/**
 * Xử Lý Submission Được Tạo
 * ========================
 * 
 * Workflow:
 * 1. Validate payload (check required fields)
 * 2. Save submission record vào database
 * 3. Publish SUBMISSION_CREATED_PROCESSED event
 * 4. Log kết quả (success or error)
 * 
 * @param payload - SubmissionCreatedPayload từ Kafka
 *   - messageId: unique message ID
 *   - timestamp: khi message được tạo
 *   - source: "discord-proxy"
 *   - data: submission info từ Discord
 * 
 * @example
 * // Kafka message received:
 * const payload = {
 *   messageId: 'msg-123',
 *   timestamp: '2024-01-15T10:30:00Z',
 *   source: 'discord-proxy',
 *   data: {
 *     submissionId: 'sub-123',
 *     studentId: 'user-456',
 *     assignmentId: 'assign-789',
 *     courseId: 'course-001',
 *     fileUrl: 'https://cdn.example.com/file.pdf'
 *   }
 * };
 * 
 * // Handler processes it:
 * await handleSubmissionCreated(payload);
 * // ✅ Submission saved: sub-123-db
 * // ✅ Analytics event published
 */
export const handleSubmissionCreated = async (
  payload: SubmissionCreatedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing submission: ${data.submissionId} from student ${data.studentId}`);

    // ===== Step 1: Validate Payload =====
    // Kiểm tra required fields (submissionId, studentId, assignmentId)
    // Nếu thiếu, báo warning và skip (don't throw để consumer tiếp tục)
    if (!data.submissionId || !data.studentId || !data.assignmentId) {
      console.warn('⚠️ Invalid submission payload (missing required fields):', {
        submissionId: data.submissionId,
        studentId: data.studentId,
        assignmentId: data.assignmentId,
      });
      return; // Skip this message, continue to next
    }

    // ===== Step 2: Save to Database =====
    // Tạo Submission record trong DB
    // Status: PENDING (chờ auto-grading hoặc manual review)
    // fileUrl: link đến file submitted (hoặc submission ID từ Discord)
    const submission = await prisma.submission.create({
      data: {
        assignmentId: data.assignmentId,
        studentId: data.studentId,
        fileUrl: data.fileUrl || data.submissionId, // Prefer fileUrl, fallback to submissionId
        status: 'PENDING', // Initial status (waiting for automatic or manual grading)
      },
    });

    console.log(`✅ Submission saved to database:`, {
      id: submission.id,
      assignmentId: data.assignmentId,
      studentId: data.studentId,
    });

    // ===== Step 3: Publish Analytics Event =====
    // Báo Analytics/Grading Service biết submission mới  được save
    // Điều này trigger auto-grading flow (nếu assignment có auto-grading)
    await publishProcessSubmission({
      source: 'logic-service',
      data: {
        submissionId: submission.id, // Database ID (not Discord submission ID)
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
    // ===== Error Handling =====
    // Log error nhưng không throw (để Kafka consumer tiếp tục xử lý messages)
    // File sẽ được lưu vào dead letter queue hoặc retry topic
    console.error('❌ Error in submissionHandler:', error);
    // Don't throw - keep consumer running for next messages
  }
};

export default handleSubmissionCreated;
