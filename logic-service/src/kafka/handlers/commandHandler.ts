/**
 * Command Handler - Xử Lý Discord Slash Commands
 * ================================================
 * 
 * Mục đích:
 * - Nhận COMMAND_REQUESTED message từ Discord Proxy
 * - Parse & route command tới handler phù hợp
 * - Execute logic (query database, call services)
 * - Gửi response về Discord
 * 
 * Supported Commands:
 * 1. /grades [assignment_id] - View student's grades
 * 2. /my_assignments - List pending assignments
 * 3. /class_stats - View course statistics
 * 
 * Message Flow:
 * Discord User: /grades
 *   └── Discord Proxy Service
 *       └── COMMAND_REQUESTED message (Kafka)
 *           └── Logic Service (this handler)
 *               ├── Route to handleGradesCommand()
 *               ├── Query grades from DB
 *               ├── Format response
 *               └── Publish DISCORD_RESPONSE event
 * 
 * Kafka Message Format:
 * {
 *   "messageId": "msg-666",
 *   "timestamp": "2024-01-15T14:00:00Z",
 *   "source": "discord-proxy",
 *   "data": {
 *     "commandId": "cmd-001",
 *     "commandName": "grades",
 *     "userId": "user-456",
 *     "courseId": "course-001",
 *     "args": {
 *       "assignmentId": "assign-789"  (optional)
 *     }
 *   }
 * }
 * 
 * Error Handling:
 * - Invalid payload → log warning, skip
 * - Unknown command → return error message to Discord
 * - DB query error → return user-friendly error message
 * - Kafka publish error → log error, still return to handler
 * 
 * Dùng bởi: kafkaConsumer (subscribes to COMMAND_REQUESTED topic)
 */

import { CommandRequestedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishDiscordResponse } from '../producer';
import { getCourseStats } from '../../services/contextService';

/**
 * Xử Lý Command Requested Từ Discord
 * ==================================
 * 
 * Workflow:
 * 1. Validate payload (check commandId, commandName, userId)
 * 2. Route command to appropriate handler
 * 3. Execute handler logic (query DB, format response)
 * 4. Publish response back to Discord
 * 5. Log result
 * 
 * @param payload - CommandRequestedPayload từ Kafka
 *   - messageId: unique message ID
 *   - timestamp: khi message được tạo
 *   - source: "discord-proxy"
 *   - data: command info
 *     - commandId: unique command execution ID
 *     - commandName: command name (grades, my_assignments, etc)
 *     - userId: who executed command
 *     - courseId: course context (optional)
 *     - args: command arguments
 * 
 * @example
 * // Kafka message from Discord:
 * const payload = {
 *   messageId: 'msg-666',
 *   timestamp: '2024-01-15T14:00:00Z',
 *   source: 'discord-proxy',
 *   data: {
 *     commandId: 'cmd-001',
 *     commandName: 'grades',
 *     userId: 'user-456',
 *     courseId: 'course-001'
 *   }
 * };
 * 
 * // Handler processes:
 * await handleCommandRequested(payload);
 * // ✅ Command routed to /grades handler
 * // ✅ Database queried for grades
 * // ✅ Response published back to Discord
 */
export const handleCommandRequested = async (
  payload: CommandRequestedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing command: /${data.commandName} from user ${data.userId}`);

    // ===== Step 1: Validate Payload =====
    // Check required fields: commandId, commandName, userId
    if (!data.commandId || !data.commandName || !data.userId) {
      console.warn('⚠️ Invalid command payload (missing required fields):', {
        commandId: data.commandId,
        commandName: data.commandName,
        userId: data.userId,
      });
      return; // Skip
    }

    // ===== Step 2: Route Command =====
    // Route tới handler phù hợp dựa trên command name
    let response: any = null;

    switch (data.commandName) {
      // /grades [assignmentId] - View grades
      case 'grades':
        response = await handleGradesCommand(data);
        break;

      // /my_assignments - List pending assignments
      case 'my_assignments':
        response = await handleMyAssignmentsCommand(data);
        break;

      // /class_stats - View course statistics
      case 'class_stats':
        response = await handleClassStatsCommand(data);
        break;

      // Unknown command
      default:
        response = {
          commandId: data.commandId,
          status: 'error',
          message: `❌ Unknown command: /${data.commandName}`,
        };
    }

    // ===== Step 3: Publish Response =====
    // If response generated, send back to Discord
    if (response) {
      await publishDiscordResponse({
        source: 'logic-service',
        data: {
          userId: data.userId,
          commandId: data.commandId,
          status: response.status || 'success',
          message: response.message || '',
          payload: response.data, // Extra data (grades list, assignments, stats)
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
    // ===== Error Handling =====
    // Log error nhưng don't throw (keep consumer running)
    console.error('❌ Error in commandHandler:', error);
    // Don't throw - continue to next message
  }
};

/**
 * Xử Lý '/grades' Command
 * ======================
 * 
 * Tác dụng:
 * - Hiển thị điểm của student cho một assignment
 * - Hoặc tất cả assignments nếu không chỉ định
 * 
 * Usage:
 * - /grades → Show all grades (10 latest)
 * - /grades assign-789 → Show grade for specific assignment
 * 
 * Response Format:
 * OK: {score: 85, maxScore: 100, feedback: '...'}
 * Error: "Bạn chưa nộp bài này hoặc bài chưa được chấm."
 */
async function handleGradesCommand(data: any) {
  try {
    // ===== Parse Arguments =====
    const assignmentId = data.args?.assignmentId;

    if (assignmentId) {
      // ===== Case 1: Get grade for specific assignment =====
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
        // No grade yet (either not submitted or not graded)
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
          feedback: grade.comment || 'Không có nhận xét', // No comment = "No feedback"
        },
      };
    } else {
      // ===== Case 2: Get all grades for student =====
      const grades = await prisma.grade.findMany({
        where: { submission: { studentId: data.userId } },
        include: {
          submission: {
            include: {
              assignment: { select: { title: true, maxScore: true } },
            },
          },
        },
        take: 10, // Latest 10 grades
        orderBy: { createdAt: 'desc' }, // Newest first
      });

      if (grades.length === 0) {
        return {
          status: 'ok',
          message: '📋 Bạn chưa có điểm nào.', // "You have no grades yet."
        };
      }

      // Format: [{assignment, score, maxScore}, ...]
      const gradeList = grades.map(g => ({
        assignment: g.submission.assignment.title,
        score: g.score,
        maxScore: g.submission.assignment.maxScore,
        percentage: ((g.score / g.submission.assignment.maxScore) * 100).toFixed(1) + '%',
      }));

      return {
        status: 'ok',
        message: `✅ Điểm của bạn (${grades.length} bài):`, // "Your grades (X assignments):"
        data: gradeList,
      };
    }
  } catch (error) {
    console.error('❌ Error in /grades command:', error);
    return {
      status: 'error',
      message: '❌ Không thể lấy thông tin điểm.', // "Cannot retrieve grades."
    };
  }
}

/**
 * Xử Lý '/my_assignments' Command
 * ===============================
 * 
 * Tác dụng:
 * - Hiển thị danh sách assignments sắp tới
 * - Sắp xếp theo deadline
 * - Chỉ show assignments có deadline chưa tới
 * 
 * Usage:
 * /my_assignments → List 5 most urgent assignments
 * 
 * Response Format:
 * [{title, course, deadline}, ...]
 */
async function handleMyAssignmentsCommand(data: any) {
  try {
    // ===== Get Student's Enrollments =====
    // Lấy tất cả khóa học mà sinh viên enrolled
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: data.userId },
      include: {
        course: {
          include: {
            assignments: {
              where: {
                deadline: {
                  gte: new Date(), // Only assignments with deadline in future
                },
              },
              orderBy: { deadline: 'asc' }, // Soonest deadline first
              take: 5, // Limit to 5 per course
            },
          },
        },
      },
    });

    if (enrollments.length === 0 || enrollments[0].course.assignments.length === 0) {
      return {
        status: 'ok',
        message: '✅ Không có bài tập nào sắp tới.', // "No pending assignments."
      };
    }

    // ===== Format Assignments =====
    // Merge all assignments from all courses + sort by deadline
    const assignments = enrollments
      .flatMap(e => e.course.assignments.map(a => ({ ...a, course: e.course })))
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
      .slice(0, 5); // Top 5 most urgent

    const assignmentList = assignments.map(a => ({
      title: a.title,
      course: a.course.name,
      deadline: a.deadline.toLocaleDateString('vi-VN'), // Format: DD/MM/YYYY
      daysLeft: Math.ceil((a.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
    }));

    return {
      status: 'ok',
      message: `📋 ${assignments.length} bài tập sắp tới:`, // "X assignments pending:"
      data: assignmentList,
    };
  } catch (error) {
    console.error('❌ Error in /my_assignments command:', error);
    return {
      status: 'error',
      message: '❌ Không thể lấy danh sách bài tập.', // "Cannot retrieve assignments."
    };
  }
}

/**
 * Xử Lý '/class_stats' Command
 * ===========================
 * 
 * Tác dụng:
 * - Hiển thị thống kê khóa học
 * - Enrollment count, submission rate, average grades
 * 
 * Usage:
 * /class_stats [courseId] → Show stats for course
 * 
 * Response Format:
 * {
 *   enrollments: 30,
 *   submissions: 140,
 *   submissionRate: "93.33%",
 *   avgScore: 82.5,
 *   avgPercentage: "82.50%"
 * }
 */
async function handleClassStatsCommand(data: any) {
  try {
    // ===== Get Course ID =====
    // Use provided courseId or from command context
    const courseId = data.args?.courseId || data.courseId;

    if (!courseId) {
      return {
        status: 'error',
        message: '❌ Cần chỉ định courseId.', // "Must specify courseId."
      };
    }

    // ===== Fetch Course Stats =====
    // Call contextService to get stats (with caching)
    const stats = await getCourseStats(courseId);

    // ===== Format Response =====
    return {
      status: 'ok',
      message: `📊 Thống kê khóa học:`, // "Course statistics:"
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
      message: '❌ Không thể lấy thống kê khóa học.', // "Cannot retrieve course stats."
    };
  }
}

export default handleCommandRequested;
