/**
 * Command Handler
 * Xử lý: COMMAND_REQUESTED message từ Discord Proxy Service
 * 
 * Workflow:
 * 1. Nhận slash command từ Discord
 * 2. Parse command & arguments
 * 3. Execute logic (ví dụ: /grades, /class_stats, /my_assignments)
 * 4. Gửi response về Discord
 */

import { CommandRequestedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishDiscordResponse } from '../producer';
import { getCourseStats } from '../../services/contextService';

export const handleCommandRequested = async (
  payload: CommandRequestedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing command: /${data.commandName} from ${data.userId}`);

    // ===== Validate payload =====
    if (!data.commandId || !data.commandName || !data.userId) {
      console.warn('⚠️ Invalid command payload:', data);
      return;
    }

    // ===== Route command =====
    let response: any = null;

    switch (data.commandName) {
      case 'grades':
        response = await handleGradesCommand(data);
        break;
      case 'my_assignments':
        response = await handleMyAssignmentsCommand(data);
        break;
      case 'class_stats':
        response = await handleClassStatsCommand(data);
        break;
      default:
        response = {
          commandId: data.commandId,
          status: 'error',
          message: `Unknown command: /${data.commandName}`,
        };
    }

    if (response) {
      // ===== Publish Response to Discord =====
      await publishDiscordResponse({
        source: 'logic-service',
        data: {
          userId: data.userId,
          commandId: data.commandId,
          status: response.status || 'success',
          message: response.message || '',
          payload: response.data,
        },
      });
      console.log(`📤 Discord response published for command ${data.commandName}`);
    }

    console.log('✅ Command processed:', {
      commandId: data.commandId,
      commandName: data.commandName,
      userId: data.userId,
    });
  } catch (error) {
    console.error('❌ Error in commandHandler:', error);
    // Không throw - để consumer tiếp tục xử lý messages tiếp theo
  }
};

// ===== Command Handlers =====

/**
 * /grades {assignmentId?}
 * Fetch student's grades for assignments
 */
async function handleGradesCommand(data: any) {
  try {
    const assignmentId = data.args?.assignmentId;

    if (assignmentId) {
      // Get grade for specific assignment
      const grades = await prisma.grade.findMany({
        where: {
          submission: {
            studentId: data.userId,
            assignmentId,
          },
        },
        include: {
          submission: {
            include: {
              assignment: true,
            },
          },
        },
      });

      if (grades.length === 0) {
        return {
          status: 'ok',
          message: 'Bạn chưa nộp bài này hoặc bài chưa được chấm.',
        };
      }

      const grade = grades[0];
      return {
        status: 'ok',
        message: `Bài "${grade.submission.assignment.title}": ${grade.score}/${grade.submission.assignment.maxScore}`,
        data: {
          assignmentId,
          score: grade.score,
          maxScore: grade.submission.assignment.maxScore,
          feedback: grade.comment,
        },
      };
    } else {
      // Get all grades for student
      const grades = await prisma.grade.findMany({
        where: { submission: { studentId: data.userId } },
        include: {
          submission: {
            include: {
              assignment: { select: { title: true, maxScore: true } },
            },
          },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      const gradeList = grades.map(g => ({
        assignment: g.submission.assignment.title,
        score: g.score,
        maxScore: g.submission.assignment.maxScore,
      }));

      return {
        status: 'ok',
        message: `Điểm của bạn (${grades.length} bài):`,
        data: gradeList,
      };
    }
  } catch (error) {
    console.error('Error in /grades command:', error);
    return {
      status: 'error',
      message: 'Không thể lấy thông tin điểm.',
    };
  }
}

/**
 * /my_assignments
 * List pending assignments for student
 */
async function handleMyAssignmentsCommand(data: any) {
  try {
    // Get student's enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: data.userId },
      include: {
        course: {
          include: {
            assignments: {
              where: {
                deadline: {
                  gte: new Date(), // Only future deadlines
                },
              },
              orderBy: { deadline: 'asc' },
              take: 5,
            },
          },
        },
      },
    });

    if (enrollments.length === 0 || enrollments[0].course.assignments.length === 0) {
      return {
        status: 'ok',
        message: 'Không có bài tập nào sắp tới.',
      };
    }

    const assignments = enrollments
      .flatMap(e => e.course.assignments.map(a => ({ ...a, course: e.course })))
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
      .slice(0, 5);

    const assignmentList = assignments.map(a => ({
      title: a.title,
      course: a.course.name,
      deadline: a.deadline.toLocaleDateString('vi-VN'),
    }));

    return {
      status: 'ok',
      message: `${assignments.length} bài tập sắp tới:`,
      data: assignmentList,
    };
  } catch (error) {
    console.error('Error in /my_assignments command:', error);
    return {
      status: 'error',
      message: 'Không thể lấy danh sách bài tập.',
    };
  }
}

/**
 * /class_stats {courseId}
 * Fetch course statistics
 */
async function handleClassStatsCommand(data: any) {
  try {
    const courseId = data.args?.courseId || data.courseId;

    if (!courseId) {
      return {
        status: 'error',
        message: 'Cần chỉ định courseId.',
      };
    }

    const stats = await getCourseStats(courseId);

    return {
      status: 'ok',
      message: `Thống kê khóa học:`,
      data: {
        enrollments: stats.enrollmentCount,
        submissions: stats.submissionCount,
        submissionRate: `${stats.submissionRate}%`,
        avgScore: stats.avgScore,
        avgPercentage: `${stats.avgPercentage}%`,
      },
    };
  } catch (error) {
    console.error('Error in /class_stats command:', error);
    return {
      status: 'error',
      message: 'Không thể lấy thống kê khóa học.',
    };
  }
}

export default handleCommandRequested;
