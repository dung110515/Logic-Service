/**
 * Courses Routes
 * REST API endpoints cho Course management
 * 
 * Endpoints:
 * - GET /v1/courses - Danh sách khóa học
 * - GET /v1/courses/:id - Chi tiết khóa học
 * - GET /v1/courses/:id/stats - Thống kê khóa học
 * - POST /v1/courses - Tạo khóa học mới
 * - PUT /v1/courses/:id - Cập nhật khóa học
 * - DELETE /v1/courses/:id - Xóa khóa học
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import { requireAuth } from '../middlewares/auth';
import { APIResponse, CourseDTO, PaginatedAPIResponse } from '../types';
import { getCourseStats } from '../services/contextService';
import prisma from '../lib/prisma';

const router = Router();

// Áp dụng auth middleware cho tất cả routes
router.use(requireAuth);

/**
 * GET /v1/courses
 * Lấy danh sách khóa học
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page = '1', limit = '10', instructorId } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const where: any = { status: 'ACTIVE' };
    if (instructorId) {
      where.instructorId = instructorId;
    }

    // Query
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
            select: { enrollments: true },
          },
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.course.count({ where }),
    ]);

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
 * Lấy thông tin chi tiết khóa học
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Course ID is required',
      });
      return;
    }

    const course = await prisma.course.findUnique({
      where: { id },
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

    if (!course) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Course not found',
      });
      return;
    }

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
 * Lấy thống kê khóa học (tổng sinh viên, avg score, submission rate)
 */
router.get(
  '/:id/stats',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const { id } = _req.params;

    // ===== TODO: Implement =====
    // 1. Call getCourseStats(id)
    // 2. Return stats

    const stats = await getCourseStats(id);

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
 * Tạo khóa học mới
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { code, name, semester, instructorId, discordServerId } = req.body;

    // Validate
    if (!code || !name || !semester || !instructorId || !discordServerId) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'code, name, semester, instructorId, discordServerId are required',
      });
      return;
    }

    // Check instructor exists
    const instructor = await prisma.user.findUnique({ where: { id: instructorId } });
    if (!instructor) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Instructor not found',
      });
      return;
    }

    // Check course code unique
    const existing = await prisma.course.findUnique({ where: { code } });
    if (existing) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Course code already exists',
      });
      return;
    }

    // Check discord server ID unique
    const discordExists = await prisma.course.findUnique({ where: { discordServerId } });
    if (discordExists) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Discord server already used',
      });
      return;
    }

    // Create
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
          select: { enrollments: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

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
 * Cập nhật khóa học
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { name, semester } = req.body;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Course ID is required',
      });
      return;
    }

    // Check course exists
    const course = await prisma.course.findUnique({ where: { id } });
    if (!course) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Course not found',
      });
      return;
    }

    // Update
    const updated = await prisma.course.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(semester && { semester }),
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
 * Xóa khóa học
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Course ID is required',
      });
      return;
    }

    // Check course exists
    const course = await prisma.course.findUnique({
      where: { id },
      include: { enrollments: true },
    });

    if (!course) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Course not found',
      });
      return;
    }

    // Check for active enrollments
    if (course.enrollments.length > 0) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Cannot delete course with active enrollments',
      });
      return;
    }

    // Delete
    await prisma.course.delete({ where: { id } });

    const response: APIResponse = {
      success: true,
      statusCode: 200,
      message: 'Course deleted successfully',
    };

    res.status(200).json(response);
  })
);

export default router;
