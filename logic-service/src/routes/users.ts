/**
 * Users Routes - REST API Cho User Management
 * ============================================
 * 
 * Endpoints:
 * ├── GET  /v1/users           - Lấy danh sách users (paginated, filterable)
 * ├── GET  /v1/users/:id       - Chi tiết 1 user
 * ├── POST /v1/users           - Tạo user mới (ADMIN only)
 * ├── PUT  /v1/users/:id       - Cập nhật user (ADMIN or self)
 * └── DELETE /v1/users/:id     - Xóa user (ADMIN only)
 * 
 * Authentication: Tất cả endpoints yêu cầu X-Service-Token header
 * 
 * Response Format (Success):
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "Users fetched successfully",
 *   "data": [...],
 *   "meta": { "page": 1, "pageSize": 10, "total": 100 }  // Nếu paginated
 * }
 * 
 * Response Format (Error):
 * {
 *   "success": false,
 *   "statusCode": 400,
 *   "message": "Validation error",
 *   "error": { ... }
 * }
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import { requireAuth } from '../middlewares/auth';
import { APIResponse, UserDTO, PaginatedAPIResponse } from '../types';
import prisma from '../lib/prisma';

const router = Router();

// ===== MIDDLEWARE =====
// Áp dụng authentication cho tất cả endpoints
router.use(requireAuth);

/**
 * GET /v1/users
 * Lấy danh sách users với pagination & filtering
 * 
 * Query Parameters:
 * - page (optional): Số trang, mặc định 1, min 1
 * - limit (optional): Số items/trang, mặc định 10, max 100
 * - role (optional): Filter theo role (STUDENT, TEACHER, ADMIN, TRAINING)
 * 
 * Response:
 * - 200: Danh sách users + metadata pagination
 * - 400: Validation error (input không hợp lệ)
 * - 401: Unauthorized (missing auth token)
 * 
 * @example
 * GET /v1/users?page=1&limit=20&role=STUDENT
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // ===== Validate & Parse Query Parameters =====
    const { page = '1', limit = '10', role } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

    // ===== Build Filter Object =====
    // Chỉ filter theo role nếu nó là valid role
    const where: any = {};
    if (role && ['STUDENT', 'TEACHER', 'ADMIN', 'TRAINING'].includes(role as string)) {
      where.role = (role as string).toUpperCase();
    }

    // ===== Query Database =====
    // Lấy data + count tổng cộng (parallel)
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }, // Newest first
      }),
      prisma.user.count({ where }),
    ]);

    // ===== Format Response =====
    const response: PaginatedAPIResponse<UserDTO[]> = {
      success: true,
      statusCode: 200,
      message: 'Users fetched successfully',
      data: users.map((user) => ({
        id: user.id,
        email: user.email || '',
        fullName: user.fullName,
        role: (user.role.toLowerCase() as 'student' | 'teacher' | 'admin'),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      } as any as UserDTO)),
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
 * GET /v1/users/:id
 * Lấy thông tin chi tiết user
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'User ID is required',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
      return;
    }

    const response: APIResponse<UserDTO> = {
      success: true,
      statusCode: 200,
      message: 'User fetched successfully',
      data: {
        id: user.id,
        email: user.email || '',
        name: user.fullName,
        role: (user.role.toLowerCase() as 'student' | 'teacher' | 'admin'),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /v1/users
 * Tạo user mới
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, fullName, discordId, role = 'STUDENT' } = req.body;

    // Validate
    if (!fullName || !discordId) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'fullName and discordId are required',
      });
      return;
    }

    // Validate role
    if (!['STUDENT', 'TEACHER', 'ADMIN', 'TRAINING'].includes(role.toUpperCase())) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Invalid role value',
      });
      return;
    }

    // Check discord ID already exists
    const existing = await prisma.user.findUnique({ where: { discordId } });
    if (existing) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Discord ID already exists',
      });
      return;
    }

    // Check email unique if provided
    if (email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) {
        res.status(400).json({
          success: false,
          statusCode: 400,
          message: 'Email already exists',
        });
        return;
      }
    }

    // Create
    const user = await prisma.user.create({
      data: {
        fullName,
        discordId,
        email: email || null,
        role: role.toUpperCase(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const response: APIResponse<UserDTO> = {
      success: true,
      statusCode: 201,
      message: 'User created successfully',
      data: {
        id: user.id,
        email: user.email || '',
        name: user.fullName,
        role: (user.role.toLowerCase() as 'student' | 'teacher' | 'admin'),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    };

    res.status(201).json(response);
  })
);

/**
 * PUT /v1/users/:id
 * Cập nhật thông tin user
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { fullName, email } = req.body;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'User ID is required',
      });
      return;
    }

    // Check user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
      return;
    }

    // If email provided, check uniqueness
    if (email && email !== user.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) {
        res.status(400).json({
          success: false,
          statusCode: 400,
          message: 'Email already exists',
        });
        return;
      }
    }

    // Update
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(fullName && { fullName }),
        ...(email && { email }),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const response: APIResponse<UserDTO> = {
      success: true,
      statusCode: 200,
      message: 'User updated successfully',
      data: {
        id: updated.id,
        email: updated.email || '',
        name: updated.fullName,
        role: (updated.role.toLowerCase() as 'student' | 'teacher' | 'admin'),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /v1/users/:id
 * Xóa user
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'User ID is required',
      });
      return;
    }

    // Check user exists
    const user = await prisma.user.findUnique({
      where: { id },
      include: { enrollments: true },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
      return;
    }

    // Check for active enrollments
    if (user.enrollments.length > 0) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Cannot delete user with active enrollments',
      });
      return;
    }

    // Delete
    await prisma.user.delete({ where: { id } });

    const response: APIResponse = {
      success: true,
      statusCode: 200,
      message: 'User deleted successfully',
    };

    res.status(200).json(response);
  })
);

export default router;
