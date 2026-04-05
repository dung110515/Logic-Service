import { CommandRequestedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishDiscordResponse } from '../producer';
import { getCourseStats } from '../../services/contextService';

export const handleCommandRequested = async (
  payload: CommandRequestedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing command: /${data.commandName} from user ${data.userId}`);

    if (!data.commandId || !data.commandName || !data.userId) {
      console.warn('⚠️ Invalid command payload (missing required fields):', {
        commandId: data.commandId,
        commandName: data.commandName,
        userId: data.userId,
      });
      return;
    }

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
          message: `❌ Unknown command: /${data.commandName}`,
        };
    }

    if (response) {
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
      console.log(`📤 Discord response published for /${data.commandName}`);
    }

    console.log(`✅ Command processed successfully:`, {
      commandId: data.commandId,
      commandName: data.commandName,
      userId: data.userId,
      responseStatus: response?.status,
    });
  } catch (error) {

    console.error('❌ Error in commandHandler:', error);

  }
};

async function handleGradesCommand(data: any) {
  try {

    const assignmentId = data.args?.assignmentId;

    if (assignmentId) {

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
          message: '⚠️ Bạn chưa nộp bài hoặc bài chưa được chấm.',
        };
      }

      const grade = grades[0];
      return {
        status: 'ok',
        message: `✅ Bài "${grade.submission.assignment.title}": ${grade.score}/${grade.submission.assignment.maxScore}`,
        data: {
          assignmentId,
          score: grade.score,
          maxScore: grade.submission.assignment.maxScore,
          feedback: grade.comment || 'Không có nhận xét',
        },
      };
    } else {

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

      if (grades.length === 0) {
        return {
          status: 'ok',
          message: '📋 Bạn chưa có điểm nào.',
        };
      }

      const gradeList = grades.map(g => ({
        assignment: g.submission.assignment.title,
        score: g.score,
        maxScore: g.submission.assignment.maxScore,
        percentage: ((g.score / g.submission.assignment.maxScore) * 100).toFixed(1) + '%',
      }));

      return {
        status: 'ok',
        message: `✅ Điểm của bạn (${grades.length} bài):`,
        data: gradeList,
      };
    }
  } catch (error) {
    console.error('❌ Error in /grades command:', error);
    return {
      status: 'error',
      message: '❌ Không thể lấy thông tin điểm.',
    };
  }
}

async function handleMyAssignmentsCommand(data: any) {
  try {

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: data.userId },
      include: {
        course: {
          include: {
            assignments: {
              where: {
                deadline: {
                  gte: new Date(),
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
        message: '✅ Không có bài tập nào sắp tới.',
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
      daysLeft: Math.ceil((a.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
    }));

    return {
      status: 'ok',
      message: `📋 ${assignments.length} bài tập sắp tới:`,
      data: assignmentList,
    };
  } catch (error) {
    console.error('❌ Error in /my_assignments command:', error);
    return {
      status: 'error',
      message: '❌ Không thể lấy danh sách bài tập.',
    };
  }
}

async function handleClassStatsCommand(data: any) {
  try {

    const courseId = data.args?.courseId || data.courseId;

    if (!courseId) {
      return {
        status: 'error',
        message: '❌ Cần chỉ định courseId.',
      };
    }

    const stats = await getCourseStats(courseId);

    return {
      status: 'ok',
      message: `📊 Thống kê khóa học:`,
      data: {
        enrollments: stats.enrollmentCount,
        assignments: stats.totalAssignments,
        submissions: stats.submissionCount,
        submissionRate: `${stats.submissionRate}%`,
        avgScore: stats.avgScore,
        avgPercentage: `${stats.avgPercentage}%`,
      },
    };
  } catch (error) {
    console.error('❌ Error in /class_stats command:', error);
    return {
      status: 'error',
      message: '❌ Không thể lấy thống kê khóa học.',
    };
  }
}

export default handleCommandRequested;
