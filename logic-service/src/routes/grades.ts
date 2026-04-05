import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import { requireAuth } from '../middlewares/auth';
import { APIResponse, GradeDTO, PaginatedAPIResponse } from '../types';
import prisma from '../lib/prisma';
import { publishNotification } from '../kafka/producer';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {

    const { page = '1', limit = '10', studentId, assignmentId, courseId } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

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

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Grade ID is required',
      });
      return;
    }

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

    if (!grade) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Grade not found',
      });
      return;
    }

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

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { submissionId, score, comment, gradedById } = req.body;

    if (!submissionId || typeof score !== 'number' || !gradedById) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'submissionId, score, gradedById are required',
      });
      return;
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: {
            course: true,
          },
        },
        student: true,
        grade: true,
      },
    });

    if (!submission) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Submission not found',
      });
      return;
    }

    if (submission.grade) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Grade already exists for this submission',
      });
      return;
    }

    if (score < 0 || score > submission.assignment.maxScore) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: `Score must be between 0 and ${submission.assignment.maxScore}`,
      });
      return;
    }

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

    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'GRADED' },
    });

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

      console.error('Failed to publish grade notification:', error);
    }

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

router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { score, comment } = req.body;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Grade ID is required',
      });
      return;
    }

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

    if (!grade) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Grade not found',
      });
      return;
    }

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

    const scoreChanged = typeof score === 'number' && score !== grade.score;

    const updated = await prisma.grade.update({
      where: { id },
      data: {
        ...(typeof score === 'number' && { score }),
        ...(comment !== undefined && { comment: comment || null }),

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

        console.error('Failed to publish grade update notification:', error);
      }
    }

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

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Grade ID is required',
      });
      return;
    }

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

    if (!grade) {
      res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'Grade not found',
      });
      return;
    }

    await prisma.grade.delete({ where: { id } });

    await prisma.submission.update({
      where: { id: grade.submissionId },
      data: { status: 'PENDING' },
    });

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

      console.error('Failed to publish grade deletion notification:', error);
    }

    const response: APIResponse = {
      success: true,
      statusCode: 200,
      message: 'Grade deleted successfully',
    };

    res.status(200).json(response);
  })
);

export default router;
