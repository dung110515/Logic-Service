/**
 * Courses Routes - REST API Cho Course Management
 * ================================================
 * 
 * Mục đích:
 * - Cung cấp REST API endpoints để quản lý khóa học
 * - Dùng bởi admin, instructor, students
 * 
 * API Endpoints:
 * 1. GET /v1/courses?page=1&limit=10 - Danh sách khóa học (phân trang)
 * 2. GET /v1/courses/:id - Chi tiết khóa học
 * 3. GET /v1/courses/:id/stats - Thống kê khóa học (enrollment, grades, etc)
 * 4. POST /v1/courses - Tạo khóa học mới (admin/instructor only)
 * 5. PUT /v1/courses/:id - Cập nhật khóa học
 * 6. DELETE /v1/courses/:id - Xóa khóa học (hard/soft delete)
 * 
 * Authentication:
 * - ALL endpoints require authentication (JWT token)
 * - POST/PUT/DELETE require role check (admin or course instructor)
 * 
 * Response Format:
 * Success:
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "...",
 *   "data": {...},
 *   "meta": {page, limit, total, totalPages}
 * }
 * 
 * Error:
 * {
 *   "success": false,
 *   "statusCode": 400/404/500,
 *   "message": "Error message",
 *   "data": null
 * }
 * 
 * Dùng bởi: Frontend (course management page), Admin dashboard
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import { requireAuth } from '../middlewares/auth';
import { APIResponse, CourseDTO, PaginatedAPIResponse } from '../types';
import { getCourseStats } from '../services/contextService';
import prisma from '../lib/prisma';

const router = Router();

// ===== MIDDLEWARE =====
// Áp dụng auth middleware cho tất cả routes trong file
// Requires: valid JWT token in Authorization header
router.use(requireAuth);

/**
 * GET /v1/courses
 * ===============
 * Lấy danh sách tất cả khóa học (phân trang)
 * 
 * Query Parameters:
 * - page: number (default: 1, min: 1)
 * - limit: number (default: 10, max: 100)
 * - instructorId: string (optional, filter by instructor)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "course-001",
 *       "code": "CS101",
 *       "name": "Introduction to Programming",
 *       "instructorId": "user-123",
 *       "enrollmentCount": 45,
 *       "createdAt": "2024-01-15T10:00:00Z"
 *     },
 *     ...
 *   ],
 *   "meta": {
 *     "page": 1,
 *     "limit": 10,
 *     "total": 25,
 *     "totalPages": 3
 *   }
 * }
 * 
 * Status Codes:
 * - 200: Success
 * - 400: Invalid pagination parameters
 * - 401: Unauthorized (missing token)
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // ===== Parse & Validate Query Parameters =====
    const { page = '1', limit = '10', instructorId } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

    // ===== Build Database Filter =====
    const where: any = { status: 'ACTIVE' };
    if (instructorId) {
      where.instructorId = instructorId; // Filter by instructor if provided
    }

    // ===== Query Database =====
    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          semester: true,
          instructorId: true,
          _count: {
            select: { enrollments: true }, // Count enrolled students
          },
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }, // Newest first
      }),
      prisma.course.count({ where }), // Total count for pagination
    ]);

    // ===== Format Response =====
    const response: PaginatedAPIResponse<CourseDTO[]> = {
      success: true,
      statusCode: 200,
      message: 'Courses fetched successfully',
      data: courses.map((course: any) => ({
        id: course.id,
        code: course.code,
        name: course.name,
        instructorId: course.instructorId,
        enrollmentCount: course._count.enrollments,
        createdAt: course.createdAt.toISOString(),
        updatedAt: course.updatedAt.toISOString(),
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
 * GET /v1/courses/:id
 * ===================
 * Lấy thông tin chi tiết khóa học theo ID
 * 
 * Path Parameters:
 * - id: string (required, course UUID)
 * 
 * Example Request:
 * GET /v1/courses/course-001
 * 
 * Response (200 Success):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "course-001",
 *     "code": "CS101",
 *     "name": "Introduction to Programming",
 *     "instructorId": "user-123",
 *     "enrollmentCount": 45,
 *     "createdAt": "2024-01-15T10:00:00Z",
 *     "updatedAt": "2024-01-20T15:30:00Z"
 *   }
 * }
 * 
 * Error Cases (4xx):
 * - 400: ID is required
 * - 404: Course not found (deleted or invalid ID)
 * - 401: Unauthorized (no valid token)
 * 
 * Workflow:
 * 1. Parse course ID from URL path
 * 2. Query database for course details
 * 3. Return full course information
 * 4. If course deleted or not found, return 404
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
        message: 'Course ID is required',
      });
      return;
    }

    // ===== Query Database =====
    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        semester: true,
        instructorId: true,
        _count: {
          select: { enrollments: true }, // Count enrolled students
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    // ===== Handle Not Found =====
    if (!course) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Course not found',
      });
      return;
    }

    // ===== Format & Send Response =====
    const response: APIResponse<CourseDTO> = {
      success: true,
      statusCode: 200,
      message: 'Course fetched successfully',
      data: {
        id: course.id,
        code: course.code,
        name: course.name,
        instructorId: course.instructorId,
        enrollmentCount: course._count.enrollments,
        createdAt: course.createdAt.toISOString(),
        updatedAt: course.updatedAt.toISOString(),
      },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /v1/courses/:id/stats
 * ========================
 * Lấy thống kê chi tiết khóa học
 * 
 * Thông tin được cung cấp:
 * - totalStudents: số sinh viên enrolled
 * - totalAssignments: số assignments trong course
 * - completedAssignments: số assignments đã submit
 * - averageGrade: điểm trung bình của toàn bộ sinh viên
 * - submissionRate: phần trăm sinh viên submit assignments
 * - cacheStatus: nếu dữ liệu từ Redis cache
 * 
 * Path Parameters:
 * - id: string (required, course UUID)
 * 
 * Example Request:
 * GET /v1/courses/course-001/stats
 * 
 * Response (200 Success):
 * {
 *   "success": true,
 *   "data": {
 *     "totalStudents": 45,
 *     "totalAssignments": 12,
 *     "completedAssignments": 480,  // 45 students * 12 assignments
 *     "averageGrade": 78.5,
 *     "submissionRate": 88.9,  // percentage
 *     "cacheStatus": "HIT"  // or MISS if fresh from DB
 *   }
 * }
 * 
 * Performance Note:
 * - Stats are cached in Redis for 24 hours
 * - First request: queries database (slower)
 * - Subsequent requests: reads from Redis cache (fast)
 * - Cache invalidates when grades or submissions change
 * 
 * Status Codes:
 * - 200: Success
 * - 404: Course not found
 * - 401: Unauthorized
 * 
 * Workflow:
 * 1. Parse course ID
 * 2. Call getCourseStats(id) from contextService
 * 3. getCourseStats internally:
 *    a. Check Redis cache first
 *    b. If miss: query DB for enrollments, assignments, grades
 *    c. Calculate stats (avg, submission %, etc)
 *    d. Cache for 24 hours
 *    e. Return result
 * 4. Return stats to client
 */
router.get(
  '/:id/stats',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const { id } = _req.params;

    // ===== Fetch Course Statistics =====
    // contextService.getCourseStats() handles:
    // - Cache check (Redis)
    // - Database query (if cache miss)
    // - Statistics calculation
    // - Cache set (24-hour TTL)
    const stats = await getCourseStats(id);

    // ===== Format & Send Response =====
    const response: APIResponse = {
      success: true,
      statusCode: 200,
      message: 'Course stats fetched successfully',
      data: stats,
    };

    res.status(200).json(response);
  })
);

/**
 * POST /v1/courses
 * ===============
 * Tạo khóa học mới (admin/instructor only)
 * 
 * Request Body:
 * {
 *   "code": "CS101",                    // Required, unique course code (e.g., CS101, MATH201)
 *   "name": "Programming Fundamentals", // Required, course name
 *   "semester": "Fall 2024",            // Required, semester/term info
 *   "instructorId": "user-123",         // Required, user UUID of instructor
 *   "discordServerId": "123456789"      // Required, Discord server ID for this course
 * }
 * 
 * Response (201 Created):
 * {
 *   "success": true,
 *   "statusCode": 201,
 *   "message": "Course created successfully",
 *   "data": {
 *     "id": "course-new-001",
 *     "code": "CS101",
 *     "name": "Programming Fundamentals",
 *     "instructorId": "user-123",
 *     "enrollmentCount": 0,
 *     "createdAt": "2024-01-25T10:30:00Z",
 *     "updatedAt": "2024-01-25T10:30:00Z"
 *   }
 * }
 * 
 * Error Cases:
 * - 400: Missing required fields
 * - 400: Instructor not found
 * - 400: Course code already exists (duplicate)
 * - 400: Discord server ID already used for another course
 * - 401: Unauthorized
 * - 403: User not admin/instructor (role check)
 * 
 * Uniqueness Constraints:
 * - code: Each course must have unique code (e.g., CS101 can exist once)
 * - discordServerId: Each Discord server maps to exactly one course
 *   (prevents confusion if Discord server accidentally used twice)
 * 
 * Workflow:
 * 1. Validate request body (all fields required)
 * 2. Check instructor exists in database
 * 3. Check course code is unique
 * 4. Check Discord server ID not used elsewhere
 * 5. Create course in database
 * 6. Return newly created course with ID
 * 
 * Access Control:
 * - Only admins and instructors can create courses
 * - Check happens in app.ts or specific route guard
 * 
 * Note:
 * - enrollmentCount starts at 0 (no students enrolled yet)
 * - instructorId must be valid user in system
 * - discordServerId must be real Discord server ID (not validated here)
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { code, name, semester, instructorId, discordServerId } = req.body;

    // ===== Step 1: Validate Required Fields =====
    if (!code || !name || !semester || !instructorId || !discordServerId) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'code, name, semester, instructorId, discordServerId are required',
      });
      return;
    }

    // ===== Step 2: Verify Instructor Exists =====
    const instructor = await prisma.user.findUnique({ where: { id: instructorId } });
    if (!instructor) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Instructor not found',
      });
      return;
    }

    // ===== Step 3: Check Course Code Uniqueness =====
    const existing = await prisma.course.findUnique({ where: { code } });
    if (existing) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Course code already exists',
      });
      return;
    }

    // ===== Step 4: Check Discord Server ID Uniqueness =====
    const discordExists = await prisma.course.findUnique({ where: { discordServerId } });
    if (discordExists) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Discord server already used',
      });
      return;
    }

    // ===== Step 5: Create Course in Database =====
    const course = await prisma.course.create({
      data: {
        code,
        name,
        semester,
        instructorId,
        discordServerId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        semester: true,
        instructorId: true,
        _count: {
          select: { enrollments: true }, // Should be 0 for new course
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    // ===== Step 6: Return Created Course =====
    const response: APIResponse<CourseDTO> = {
      success: true,
      statusCode: 201,
      message: 'Course created successfully',
      data: {
        id: course.id,
        code: course.code,
        name: course.name,
        instructorId: course.instructorId,
        enrollmentCount: course._count.enrollments,
        createdAt: course.createdAt.toISOString(),
        updatedAt: course.updatedAt.toISOString(),
      },
    };

    res.status(201).json(response);
  })
);

/**
 * PUT /v1/courses/:id
 * ==================
 * Cập nhật thông tin khóa học (name, semester)
 * 
 * Path Parameters:
 * - id: string (required, course UUID)
 * 
 * Request Body (at least one field required):
 * {
 *   "name": "Advanced Programming",     // Optional, new course name
 *   "semester": "Spring 2025"           // Optional, new semester
 * }
 * 
 * Response (200 Success):
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "Course updated successfully",
 *   "data": {
 *     "id": "course-001",
 *     "code": "CS101",  // Code cannot be changed
 *     "name": "Advanced Programming",
 *     "instructorId": "user-123",
 *     "enrollmentCount": 45,
 *     "createdAt": "2024-01-15T10:00:00Z",
 *     "updatedAt": "2024-01-25T14:20:00Z"  // Updated timestamp
 *   }
 * }
 * 
 * Error Cases:
 * - 400: Course ID is required
 * - 400: Database update failed (rare)
 * - 404: Course not found
 * - 401: Unauthorized
 * - 403: Only course instructor or admin can update
 * 
 * Fields That Can Be Updated:
 * - name: Course name (e.g., "CS101" → "Advanced CS101")
 * - semester: Semester/term (e.g., "Fall 2024" → "Spring 2025")
 * 
 * Fields That CANNOT Be Updated:
 * - code: Course code is immutable (would break enrollments)
 * - instructorId: Need separate endpoint (would require access control)
 * - discordServerId: Need separate endpoint (would break Discord integration)
 * - id: Primary key, immutable
 * - enrollments: Managed through separate endpoints
 * 
 * Workflow:
 * 1. Parse course ID from URL
 * 2. Verify course exists (return 404 if not)
 * 3. Update name and semester (only non-null values)
 * 4. Update updatedAt timestamp automatically
 * 5. Return updated course with new values
 * 6. Benefit: enrollments, code, instructor unchanged
 * 
 * Partial Updates:
 * - You can update just name (leave semester as is)
 * - You can update just semester (leave name as is)
 * - Or both in one request
 * 
 * Access Control:
 * Should check in route guard or middleware:
 * - Only course instructor or admin can update
 * - Prevents other instructors modifying courses
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { name, semester } = req.body;

    // ===== Validate Path Parameter =====
    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Course ID is required',
      });
      return;
    }

    // ===== Step 1: Verify Course Exists =====
    const course = await prisma.course.findUnique({ where: { id } });
    if (!course) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Course not found',
      });
      return;
    }

    // ===== Step 2: Update Only Provided Fields =====
    // Only update name/semester if they're provided in request
    // This allows partial updates (e.g., just name without semester)
    const updated = await prisma.course.update({
      where: { id },
      data: {
        ...(name && { name }),           // Update only if provided
        ...(semester && { semester }),   // Update only if provided
        // Note: updatedAt is set automatically by Prisma
      },
      select: {
        id: true,
        code: true,
        name: true,
        semester: true,
        instructorId: true,
        _count: {
          select: { enrollments: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    // ===== Step 3: Return Updated Course =====
    const response: APIResponse<CourseDTO> = {
      success: true,
      statusCode: 200,
      message: 'Course updated successfully',
      data: {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        instructorId: updated.instructorId,
        enrollmentCount: updated._count.enrollments,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /v1/courses/:id
 * ====================
 * Xóa khóa học (hard delete - permanent)
 * 
 * Path Parameters:
 * - id: string (required, course UUID)
 * 
 * Prerequisites:
 * - Course must have NO active enrollments
 * - If students enrolled, must unenroll them first
 * - Then can delete the now-empty course
 * 
 * Response (200 Success):
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "Course deleted successfully"
 * }
 * 
 * Error Cases:
 * - 400: Course ID is required
 * - 400: Cannot delete course with active enrollments (has students)
 * - 404: Course not found
 * - 401: Unauthorized
 * - 403: Only admin or course instructor can delete
 * 
 * Important Constraints:
 * - Hard delete (no soft delete, permanent removal)
 * - Cannot delete if students enrolled
 * - Related data cascade:
 *   - Assignments in course are deleted
 *   - Submissions are deleted (WARNING: data loss)
 *   - Grades are deleted (WARNING: data loss)
 * 
 * Safe Deletion Workflow:
 * 1. Unenroll all students from course first
 * 2. Archive assignments instead of deleting course
 * 3. Then delete the empty course
 * 
 * OR
 * 
 * Archive Workflow (recommended):
 * - Don't delete courses, just mark as ARCHIVED
 * - Prevents accidental data loss
 * - Keeps historical data for audits/records
 * 
 * Delete Safety Check:
 * Before allowing delete:
 * 1. Count enrollments in course
 * 2. If count > 0: reject with 400
 * 3. If count = 0: proceed with deletion
 * 
 * Data Integrity:
 * - Check cascading deletes in Prisma schema
 * - Ensure no orphaned submissions/grades
 * - Consider backup before deletion
 * 
 * Workflow:
 * 1. Parse course ID
 * 2. Query course with enrollments
 * 3. If not found: return 404
 * 4. If has enrollments: return 400 with error message
 * 5. If empty: proceed with deletion
 * 6. Delete from database (permanent)
 * 7. Return success response
 * 
 * Access Control:
 * Should check in route guard:
 * - Only admin or course instructor can delete
 * - Prevents accidental deletion by students
 * 
 * Alternative: Soft Delete
 * - Instead of deleting, mark status="ARCHIVED"
 * - Preserves historical data
 * - Can be "unarchived" later
 * - Better for compliance/audits
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
        message: 'Course ID is required',
      });
      return;
    }

    // ===== Step 1: Fetch Course with Enrollments =====
    const course = await prisma.course.findUnique({
      where: { id },
      include: { enrollments: true }, // Include enrollment count
    });

    // ===== Step 2: Check Course Exists =====
    if (!course) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Course not found',
      });
      return;
    }

    // ===== Step 3: Check for Active Enrollments =====
    // Cannot delete if students enrolled
    // Developer must unenroll students first
    if (course.enrollments.length > 0) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Cannot delete course with active enrollments',
      });
      return;
    }

    // ===== Step 4: Delete Course (Hard Delete) =====
    // This is permanent - cannot be recovered
    // All related data deleted by Prisma cascading rules
    await prisma.course.delete({ where: { id } });

    // ===== Step 5: Return Success =====
    const response: APIResponse = {
      success: true,
      statusCode: 200,
      message: 'Course deleted successfully',
    };

    res.status(200).json(response);
  })
);

export default router;
