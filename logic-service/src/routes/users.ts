import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import { requireAuth } from '../middlewares/auth';
import { APIResponse, UserDTO, PaginatedAPIResponse } from '../types';
import prisma from '../lib/prisma';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {

    const { page = '1', limit = '10', role } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (role && ['STUDENT', 'TEACHER', 'ADMIN', 'TRAINING'].includes(role as string)) {
      where.role = (role as string).toUpperCase();
    }

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
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

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

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, fullName, discordId, role = 'STUDENT' } = req.body;

    if (!fullName || !discordId) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'fullName and discordId are required',
      });
      return;
    }

    if (!['STUDENT', 'TEACHER', 'ADMIN', 'TRAINING'].includes(role.toUpperCase())) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Invalid role value',
      });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { discordId } });
    if (existing) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Discord ID already exists',
      });
      return;
    }

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

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'User not found',
      });
      return;
    }

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

    if (user.enrollments.length > 0) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Cannot delete user with active enrollments',
      });
      return;
    }

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
