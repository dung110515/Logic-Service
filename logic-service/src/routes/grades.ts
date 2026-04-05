/**
 * Grades Routes - REST API Cho Grade Management
 * ==============================================
 * 
 * Mục đích:
 * - Cung cấp REST API để quản lý điểm số
 * - Cho phép querying grades (filter by student, assignment, course)
 * - Cho phép update/create grades (admin, instructor only)
 * 
 * API Endpoints:
 * 1. GET /v1/grades?page=1&limit=10&studentId=... - Danh sách điểm
 * 2. GET /v1/grades/:id - Chi tiết điểm
 * 3. POST /v1/grades - Tạo  điểm mới
 * 4. PUT /v1/grades/:id - Cập nhật điểm
 * 5. DELETE /v1/grades/:id - Xóa điểm
 * 
 * Query Filters:
 * - studentId: Lọc điểm theo sinh viên
 * - assignmentId: Lọc theo assignment
 * - courseId: Lọc theo khóa học
 * 
 * Authentication & Authorization:
 * - GET: All authenticated users
 * - POST/PUT/DELETE: Admin or course instructor only
 * 
 * Dùng bởi: Frontend (gradebook), instructor (manual grading)
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import { requireAuth } from '../middlewares/auth';
import { APIResponse, GradeDTO, PaginatedAPIResponse } from '../types';
import prisma from '../lib/prisma';
import { publishNotification } from '../kafka/producer';

const router = Router();

// ===== MIDDLEWARE =====
// All routes require authentication
router.use(requireAuth);

/**
 * GET /v1/grades
 * ==============
 * Lấy danh sách grades với filtering
 * 
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10, max: 100)
 * - studentId: string (optional, filter by student)
 * - assignmentId: string (optional, filter by assignment)
 * - courseId: string (optional, filter by course)
 * 
 * Response Format:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "grade-001",
 *       "studentName": "Nguyễn Văn A",
 *       "assignmentTitle": "Assignment 1",
 *       "score": 85,
 *       "maxScore": 100,
 *       "comment": "Good work",
 *       "createdAt": "2024-01-15T10:00:00Z"
 *     }
 *   ],
 *   "meta": {page: 1, limit: 10, total: 50, totalPages: 5}
 * }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // ===== Parse Query Parameters =====
    const { page = '1', limit = '10', studentId, assignmentId, courseId } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

    // ===== Build Database Filter =====
    // Support multiple filter combinations
    const where: any = {};
    if (studentId) {
      where.submission = { studentId };
    }
    if (assignmentId) {
      where.submission = { ...where.submission, assignmentId };
    }
    if (courseId) {
      where.submission = { 
        ...where.submission,
        assignment: { courseId },
      };
    }

    // ===== Query Database =====
    const [grades, total] = await Promise.all([
      prisma.grade.findMany({
        where,
        include: {
          submission: {
            include: {
              student: {
                select: { id: true, fullName: true, email: true },
              },
              assignment: {
                select: { id: true, title: true, maxScore: true },
              },
            },
          },
          gradedBy: {
            select: { id: true, fullName: true },
          },
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.grade.count({ where }),
    ]);

    const response: PaginatedAPIResponse<GradeDTO[]> = {
      success: true,
      statusCode: 200,
      message: 'Grades fetched successfully',
      data: grades.map((grade) => ({
        id: grade.id,
        studentId: grade.submission.studentId,
        assignmentId: grade.submission.assignmentId,
        score: grade.score,
        maxScore: grade.submission.assignment.maxScore,
        feedback: grade.comment || '',
        gradedAt: grade.gradedAt.toISOString(),
        createdAt: grade.createdAt.toISOString(),
        updatedAt: grade.updatedAt.toISOString(),
      })),
      meta: {
        total,
        page: pageNum,
        pageSize: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /v1/grades/:id
 * ==================
 * Lấy chi tiết điểm theo ID
 * 
 * Path Parameters:
 * - id: string (required, grade UUID)
 * 
 * Example Request:
 * GET /v1/grades/grade-001
 * 
 * Response (200 Success):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "grade-001",
 *     "studentId": "student-123",
 *     "assignmentId": "assignment-001",
 *     "score": 85,
 *     "maxScore": 100,
 *     "feedback": "Excellent work, but missing edge case handling",
 *     "gradedAt": "2024-01-20T14:30:00Z",
 *     "createdAt": "2024-01-20T14:30:00Z",
 *     "updatedAt": "2024-01-20T14:30:00Z"
 *   }
 * }
 * 
 * Includes Information:
 * - Student name and email
 * - Assignment title and max score
 * - Instructor who graded it
 * - Full audit trail (createdAt, updatedAt)
 * 
 * Error Cases:
 * - 400: Grade ID is required
 * - 404: Grade not found
 * - 401: Unauthorized
 * 
 * Workflow:
 * 1. Parse grade ID from URL
 * 2. Query database with related data
 * 3. Include student, assignment, and grader info
 * 4. Return formatted response
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    // ===== Validate Path Parameter =====
    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Grade ID is required',
      });
      return;
    }

    // ===== Query Database with Related Data =====
    const grade = await prisma.grade.findUnique({
      where: { id },
      include: {
        submission: {
          include: {
            student: {
              select: { id: true, fullName: true, email: true },
            },
            assignment: {
              select: { id: true, title: true, maxScore: true },
            },
          },
        },
        gradedBy: {
          select: { id: true, fullName: true },
        },
      },
    });

    // ===== Handle Not Found =====
    if (!grade) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Grade not found',
      });
      return;
    }

    // ===== Format & Send Response =====
    const response: APIResponse<GradeDTO> = {
      success: true,
      statusCode: 200,
      message: 'Grade fetched successfully',
      data: {
        id: grade.id,
        studentId: grade.submission.studentId,
        assignmentId: grade.submission.assignmentId,
        score: grade.score,
        maxScore: grade.submission.assignment.maxScore,
        feedback: grade.comment || '',
        gradedAt: grade.gradedAt.toISOString(),
        createdAt: grade.createdAt.toISOString(),
        updatedAt: grade.updatedAt.toISOString(),
      },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /v1/grades
 * ==============
 * Tạo điểm mới cho submission (instructor/AI grading)
 * 
 * When is this called?
 * - Manual grading: Instructor submits grade via UI
 * - Auto-grading: AI service grades assignment, sends via Kafka
 * - Quiz grading: Web service auto-calculates quiz score
 * 
 * Request Body:
 * {
 *   "submissionId": "submission-123",  // Required, unique ID of student submission
 *   "score": 85,                       // Required, numeric score (0 to maxScore)
 *   "comment": "Great solution!",      // Optional, instructor feedback
 *   "gradedById": "user-456"           // Required, ID of grader (instructor/AI service)
 * }
 * 
 * Response (201 Created):
 * {
 *   "success": true,
 *   "statusCode": 201,
 *   "message": "Grade created successfully",
 *   "data": {
 *     "id": "grade-new-001",
 *     "studentId": "student-123",
 *     "assignmentId": "assignment-001",
 *     "score": 85,
 *     "maxScore": 100,
 *     "feedback": "Great solution!"
 *   }
 * }
 * 
 * Validation Rules:
 * - submissionId: must exist, must not have grade already
 * - score: must be numeric, between 0 and maxScore
 * - comment: optional, can be null or empty string
 * - gradedById: must be valid instructor/AI service ID
 * 
 * Error Cases:
 * - 400: Missing required fields (submissionId, score, gradedById)
 * - 400: Submission not found
 * - 400: Grade already exists for this submission
 * - 400: Score out of range (0 to maxScore)
 * - 401: Unauthorized (not instructor/AI service)
 * 
 * Workflow:
 * 1. Parse & validate request body
 * 2. Lookup submission (must exist)
 * 3. Check no grade exists yet (can't grade twice)
 * 4. Validate score range (0 to assignment's maxScore)
 * 5. Create grade record in database
 * 6. Update submission status: PENDING → GRADED
 * 7. Publish notification to student (Kafka event)
 * 8. Return created grade
 * 
 * Side Effects:
 * 1. Submission status changes to GRADED
 * 2. Student receives notification (title + message + link)
 * 3. Student can view grade in dashboard
 * 4. Grade counts toward course stats/average
 * 
 * Notification Example:
 * {
 *   "title": "📝 Bài tập đã được chấm",
 *   "content": "Bài tập \"Assignment 1\" của bạn đã được chấm. Điểm: 85/100",
 *   "link": "/submissions/submission-123"
 * }
 * 
 * Idempotency:
 * - NOT idempotent: Calling twice with same data = error (grade exists)
 * - To modify grade: use PUT endpoint
 * - To remove grade: use DELETE endpoint, then POST new one
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { submissionId, score, comment, gradedById } = req.body;

    // ===== Step 1: Validate Required Fields =====
    if (!submissionId || typeof score !== 'number' || !gradedById) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'submissionId, score, gradedById are required',
      });
      return;
    }

    // ===== Step 2: Lookup Submission =====
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: {
            course: true,
          },
        },
        student: true,
        grade: true, // Check if grade already exists
      },
    });

    // ===== Step 3: Validate Submission Exists =====
    if (!submission) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Submission not found',
      });
      return;
    }

    // ===== Step 4: Check Grade Doesn't Already Exist =====
    if (submission.grade) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Grade already exists for this submission',
      });
      return;
    }

    // ===== Step 5: Validate Score Range =====
    if (score < 0 || score > submission.assignment.maxScore) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: `Score must be between 0 and ${submission.assignment.maxScore}`,
      });
      return;
    }

    // ===== Step 6: Create Grade Record =====
    const grade = await prisma.grade.create({
      data: {
        submissionId,
        score,
        comment: comment || null,
        gradedById,
      },
      include: {
        submission: {
          include: {
            student: {
              select: { id: true, fullName: true, email: true },
            },
            assignment: {
              select: { id: true, title: true, maxScore: true },
            },
          },
        },
        gradedBy: {
          select: { id: true, fullName: true },
        },
      },
    });

    // ===== Step 7: Update Submission Status =====
    // Change from PENDING/SUBMITTED to GRADED
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'GRADED' },
    });

    // ===== Step 8: Publish Notification to Student =====
    try {
      await publishNotification({
        source: 'logic-service',
        data: {
          userId: submission.studentId,
          title: '📝 Bài tập đã được chấm',
          content: `Bài tập "${submission.assignment.title}" của bạn đã được chấm. Điểm: ${score}/${submission.assignment.maxScore}`,
          link: `/submissions/${submissionId}`,
        },
      });
    } catch (error) {
      // Don't fail the request if notification fails
      console.error('Failed to publish grade notification:', error);
    }

    // ===== Step 9: Return Created Grade =====
    const response: APIResponse<GradeDTO> = {
      success: true,
      statusCode: 201,
      message: 'Grade created successfully',
      data: {
        id: grade.id,
        studentId: grade.submission.studentId,
        assignmentId: grade.submission.assignmentId,
        score: grade.score,
        maxScore: grade.submission.assignment.maxScore,
        feedback: grade.comment || '',
        gradedAt: grade.gradedAt.toISOString(),
        createdAt: grade.createdAt.toISOString(),
        updatedAt: grade.updatedAt.toISOString(),
      },
    };

    res.status(201).json(response);
  })
);

/**
 * PUT /v1/grades/:id
 * ==================
 * Cập nhật điểm (score hoặc feedback comment)
 * 
 * Khi sử dụng:
 * - Instructor thay đổi score (e.g., 80 → 85)
 * - Instructor thêm hoặc cập nhật feedback
 * - Recalibration hoặc error correction
 * 
 * Path Parameters:
 * - id: string (required, grade UUID)
 * 
 * Request Body (at least one field):
 * {
 *   "score": 90,                    // Optional, new score (0 to maxScore)
 *   "comment": "Updated feedback"   // Optional, new comment/feedback
 * }
 * 
 * Response (200 Success):
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "Grade updated successfully",
 *   "data": {
 *     "id": "grade-001",
 *     "studentId": "student-123",
 *     "assignmentId": "assignment-001",
 *     "score": 90,              // Updated
 *     "maxScore": 100,
 *     "feedback": "Updated feedback",  // Updated
 *     "updatedAt": "2024-01-25T15:00:00Z"  // Current timestamp
 *   }
 * }
 * 
 * Validation:
 * - score: must be numeric, between 0 and maxScore
 * - If score not provided: keep existing score
 * - If comment not provided: keep existing comment
 * 
 * Error Cases:
 * - 400: Grade ID is required
 * - 400: Score out of range
 * - 404: Grade not found
 * - 401: Unauthorized
 * - 403: Only grade instructor or admin can update
 * 
 * Workflow:
 * 1. Parse grade ID from URL
 * 2. Lookup grade record
 * 3. Validate provided score (if updating)
 * 4. Update score and/or comment
 * 5. Detect if score changed
 * 6. If score changed: publish notification to student
 * 7. Return updated grade
 * 
 * Audit Trail:
 * - createdAt: unchanged (when grade was first created)
 * - updatedAt: updated to current time
 * - Student can see who last modified and when
 * 
 * Student Notification (only if score changed):
 * {
 *   "title": "📝 Điểm bài tập đã được cập nhật",
 *   "content": "Điểm bài tập \"Assignment 1\" đã thay đổi thành: 90/100",
 *   "link": "/submissions/submission-123"
 * }
 * 
 * Partial Update:
 * - PATCH /v1/grades/:id (if API supports PATCH)
 * - PUT with only score: updates score, keeps comment
 * - PUT with only comment: updates comment, keeps score
 * 
 * Performance Note:
 * - Updating score changes course average (cached in Redis)
 * - Cache invalidated automatically after update
 * - Next /v1/courses/:id/stats query forces recalculation
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { score, comment } = req.body;

    // ===== Validate Path Parameter =====
    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Grade ID is required',
      });
      return;
    }

    // ===== Step 1: Lookup Grade =====
    const grade = await prisma.grade.findUnique({
      where: { id },
      include: {
        submission: {
          include: {
            student: {
              select: { id: true, fullName: true },
            },
            assignment: {
              select: { id: true, title: true, maxScore: true },
            },
          },
        },
        gradedBy: {
          select: { id: true, fullName: true },
        },
      },
    });

    // ===== Step 2: Handle Not Found =====
    if (!grade) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Grade not found',
      });
      return;
    }

    // ===== Step 3: Validate New Score (if provided) =====
    if (typeof score === 'number') {
      if (score < 0 || score > grade.submission.assignment.maxScore) {
        res.status(400).json({
          success: false,
          statusCode: 400,
          message: `Score must be between 0 and ${grade.submission.assignment.maxScore}`,
        });
        return;
      }
    }

    // ===== Step 4: Detect if Score Changed =====
    const scoreChanged = typeof score === 'number' && score !== grade.score;

    // ===== Step 5: Update Grade =====
    const updated = await prisma.grade.update({
      where: { id },
      data: {
        ...(typeof score === 'number' && { score }),      // Only if provided
        ...(comment !== undefined && { comment: comment || null }),  // Only if provided
        // Note: updatedAt set automatically by Prisma
      },
      include: {
        submission: {
          include: {
            student: {
              select: { id: true, fullName: true, email: true },
            },
            assignment: {
              select: { id: true, title: true, maxScore: true },
            },
          },
        },
        gradedBy: {
          select: { id: true, fullName: true },
        },
      },
    });

    // ===== Step 6: Publish Notification (only if score changed) =====
    if (scoreChanged) {
      try {
        await publishNotification({
          source: 'logic-service',
          data: {
            userId: updated.submission.studentId,
            title: '📝 Điểm bài tập đã được cập nhật',
            content: `Điểm bài tập "${updated.submission.assignment.title}" đã thay đổi thành: ${updated.score}/${updated.submission.assignment.maxScore}`,
            link: `/submissions/${updated.submissionId}`,
          },
        });
      } catch (error) {
        // Don't fail request if notification fails
        console.error('Failed to publish grade update notification:', error);
      }
    }

    // ===== Step 7: Return Updated Grade =====
    const response: APIResponse<GradeDTO> = {
      success: true,
      statusCode: 200,
      message: 'Grade updated successfully',
      data: {
        id: updated.id,
        studentId: updated.submission.studentId,
        assignmentId: updated.submission.assignmentId,
        score: updated.score,
        maxScore: updated.submission.assignment.maxScore,
        feedback: updated.comment || '',
        gradedAt: updated.gradedAt.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /v1/grades/:id
 * ====================
 * Xóa điểm (undo grading)
 * 
 * When to use:
 * - Instructor grades by mistake, needs to remove and re-grade
 * - Grade recorded to wrong student, needs deletion
 * - Appeals process: remove old grade before new grade
 * 
 * Path Parameters:
 * - id: string (required, grade UUID)
 * 
 * Response (200 Success):
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "Grade deleted successfully"
 * }
 * 
 * Error Cases:
 * - 400: Grade ID is required
 * - 404: Grade not found
 * - 401: Unauthorized
 * - 403: Only admin or grade instructor can delete
 * 
 * Side Effects:
 * 1. Grade record deleted from database (permanent)
 * 2. Submission status reverted: GRADED → PENDING
 *    (so it appears ungraded again)
 * 3. Student notified: grade was removed
 * 4. Course stats recalculated (average drops by 1 grade)
 * 5. (Optional) Grade appears in deletion audit log
 * 
 * Workflow:
 * 1. Parse grade ID
 * 2. Lookup grade with submission/student info
 * 3. If not found: return 404
 * 4. Delete grade from database
 * 5. Revert submission status: GRADED → PENDING
 * 6. Publish notification to student
 * 7. Return success
 * 
 * Data Integrity:
 * - Before deletion: save audit record (optional)
 * - Deletion is hard delete (permanent)
 * - Cannot be undone (restore from backup if needed)
 * 
 * Submission Status Flow:
 * Before:  PENDING → (grade created) → GRADED
 * After:   GRADED → (grade deleted) → PENDING
 * Next:    PENDING → (new grade created) → GRADED
 * 
 * Notification to Student:
 * {
 *   "title": "📝 Điểm bài tập đã bị xóa",
 *   "content": "Điểm cho bài tập \"Assignment 1\" đã bị xóa. Vui lòng chờ cập nhật mới.",
 *   "link": "/assignments/assignment-001"
 * }
 * 
 * Performance Impact:
 * - Deleting grade changes course average
 * - Redis cache invalidated
 * - Next stats query recalculates from database
 * - Affects: /v1/courses/:id/stats, /v1/grades, dashboards
 * 
 * Alternative to Delete:
 * - Instead of deleting: use PUT to update score
 * - Keeps audit trail (updatedAt shows correction time)
 * - Better for compliance (shows history of changes)
 * - If deletion needed: add soft-delete flag to schema
 * 
 * Audit & Compliance:
 * - Log deletion in application logs
 * - Store who deleted it and when
 * - Store previous score/feedback (for recovery)
 * - Useful for grade appeals and investigations
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    // ===== Validate Path Parameter =====
    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Grade ID is required',
      });
      return;
    }

    // ===== Step 1: Lookup Grade =====
    const grade = await prisma.grade.findUnique({
      where: { id },
      include: {
        submission: {
          include: {
            student: {
              select: { id: true, fullName: true },
            },
            assignment: {
              select: { id: true, title: true },
            },
          },
        },
      },
    });

    // ===== Step 2: Check Grade Exists =====
    if (!grade) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Grade not found',
      });
      return;
    }

    // ===== Step 3: Delete Grade (Hard Delete) =====
    // This is permanent - cannot be recovered
    await prisma.grade.delete({ where: { id } });

    // ===== Step 4: Revert Submission Status =====
    // Change from GRADED back to PENDING
    // This makes submission appear ungraded again
    await prisma.submission.update({
      where: { id: grade.submissionId },
      data: { status: 'PENDING' },
    });

    // ===== Step 5: Publish Notification to Student =====
    try {
      await publishNotification({
        source: 'logic-service',
        data: {
          userId: grade.submission.studentId,
          title: '📝 Điểm bài tập đã bị xóa',
          content: `Điểm cho bài tập "${grade.submission.assignment.title}" đã bị xóa. Vui lòng chờ cập nhật mới.`,
          link: `/assignments/${grade.submission.assignmentId}`,
        },
      });
    } catch (error) {
      // Log but don't fail request
      console.error('Failed to publish grade deletion notification:', error);
    }

    // ===== Step 6: Return Success =====
    const response: APIResponse = {
      success: true,
      statusCode: 200,
      message: 'Grade deleted successfully',
    };

    res.status(200).json(response);
  })
);

export default router;
