/**
 * Context Service
 * Xây dựng context (bối cảnh khóa học) cho AI reasoning
 * Dùng bởi: contextHandler (Q&A), commandHandler (/class_stats)
 */

import { prisma } from '../lib/prisma';
import { getRedisClient, isRedisConnected } from '../lib/redis';
import { AIContextData } from '../types';
import { REDIS_CACHE } from '../config/constants';

/**
 * Lấy context cho sinh viên trong khóa học
 * Bao gồm: tài liệu, bài tập, danh sách bạn cùng lớp, thời hạn sắp tới
 *
 * @param studentId - ID sinh viên
 * @param courseId - ID khóa học
 * @param useCache - Có dùng cache Redis không (default: true)
 * @returns AIContextData - dữ liệu context cho AI
 */
export const getStudentCourseContext = async (
  studentId: string,
  courseId: string,
  useCache = true
): Promise<AIContextData> => {
  try {
    // ===== Check Redis Cache =====
    if (useCache && isRedisConnected()) {
      const redis = getRedisClient();
      const cacheKey = `context:${studentId}:${courseId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit: ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    // ===== Fetch from Database =====
    console.log(`🔄 Building context for student ${studentId} in course ${courseId}`);

    // 1. Get course info
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!course) {
      throw new Error(`Course ${courseId} not found`);
    }

    // 2. Get course documents (for context/summarization)
    const documents = await prisma.document.findMany({
      where: { courseId },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        // TODO: Add 'summary' field to Document model once AI summarization is done
      },
      take: 10, // Limit to 10 latest documents
      orderBy: { createdAt: 'desc' },
    });

    // 3. Get active assignments
    const assignments = await prisma.assignment.findMany({
      where: { courseId },
      select: {
        id: true,
        title: true,
        deadline: true,
        rubricUrl: true,
      },
      take: 10, // Limit to 10 latest
      orderBy: { deadline: 'asc' }, // Most urgent first
    });

    // 4. Get classmates (enrolled students)
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      select: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      take: 20, // Limit to 20 students
    });

    const students = enrollments.map(e => ({
      id: e.user.id,
      name: e.user.fullName,
      email: e.user.email || '',
    }));

    // ===== Build Context =====
    const context: AIContextData = {
      courseId,
      course: {
        name: course.name,
        code: course.code,
      },
      documents: documents.map(d => ({
        id: d.id,
        title: d.fileName,
        summary: `Document: ${d.fileName}`, // TODO: Use actual summary once available
        fileUrl: d.fileUrl,
      })),
      assignments: assignments.map(a => ({
        id: a.id,
        title: a.title,
        deadline: a.deadline.toISOString(),
        rubricUrl: a.rubricUrl || undefined,
      })),
      students,
    };

    // ===== Cache Result =====
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const cacheKey = `context:${studentId}:${courseId}`;
      const ttl = REDIS_CACHE.CONTEXT.ttl;
      await redis.setex(cacheKey, ttl, JSON.stringify(context));
    }

    console.log(`✅ Context built for ${studentId} in ${courseId}`);
    return context;
  } catch (error) {
    console.error('❌ Error building context:', error);
    throw error;
  }
};

/**
 * Lấy thống kê khóa học
 * Bao gồm: tổng sinh viên, avg điểm, submission rate
 * Dùng bởi: commandHandler (/class_stats)
 *
 * @param courseId - ID khóa học
 * @returns Thống kê khóa học (JSON)
 */
export const getCourseStats = async (courseId: string): Promise<Record<string, any>> => {
  try {
    // ===== Check Cache =====
    const cacheKey = `course:stats:${courseId}`;
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`✅ Stats cache hit: ${courseId}`);
        return JSON.parse(cached);
      }
    }

    console.log(`🔄 Calculating course stats for ${courseId}`);

    // Total enrollments
    const enrollmentCount = await prisma.enrollment.count({
      where: { courseId },
    });

    // Grades statistics
    const grades = await prisma.grade.findMany({
      where: {
        submission: {
          assignment: { courseId },
        },
      },
      select: { 
        score: true,
        submission: {
          select: {
            assignment: {
              select: { maxScore: true }
            }
          }
        }
      },
    });

    const avgScore =
      grades.length > 0
        ? grades.reduce((sum, g) => sum + g.score, 0) / grades.length
        : 0;

    const avgPercentage =
      grades.length > 0
        ? (grades.reduce((sum, g) => sum + (g.score / g.submission.assignment.maxScore) * 100, 0) /
            grades.length)
        : 0;

    // Submission rate
    const totalAssignments = await prisma.assignment.count({
      where: { courseId },
    });

    const submissions = await prisma.submission.count({
      where: {
        assignment: { courseId },
      },
    });

    const submissionRate =
      totalAssignments > 0 ? (submissions / (enrollmentCount * totalAssignments)) * 100 : 0;

    const stats = {
      courseId,
      enrollmentCount,
      totalAssignments,
      submissionCount: submissions,
      submissionRate: parseFloat(submissionRate.toFixed(2)),
      avgScore: parseFloat(avgScore.toFixed(2)),
      avgPercentage: parseFloat(avgPercentage.toFixed(2)),
      gradeCount: grades.length,
      timestamp: new Date().toISOString(),
    };

    // ===== Cache Result =====
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const ttl = REDIS_CACHE.COURSE_STATS.ttl;
      await redis.setex(cacheKey, ttl, JSON.stringify(stats));
    }

    console.log(`✅ Stats calculated for ${courseId}`);
    return stats;
  } catch (error) {
    console.error('❌ Error calculating course stats:', error);
    throw error;
  }
};

/**
 * Invalidate context cache (khi có update/delete)
 */
export const invalidateContextCache = async (studentId: string, courseId: string): Promise<void> => {
  if (isRedisConnected()) {
    const redis = getRedisClient();
    const cacheKey = `context:${studentId}:${courseId}`;
    await redis.del(cacheKey);
    console.log(`🗑️ Cache invalidated: ${cacheKey}`);
  }
};

/**
 * Invalidate course stats cache
 */
export const invalidateCourseStatsCache = async (courseId: string): Promise<void> => {
  if (isRedisConnected()) {
    const redis = getRedisClient();
    const cacheKey = `course:stats:${courseId}`;
    await redis.del(cacheKey);
    console.log(`🗑️ Cache invalidated: ${cacheKey}`);
  }
};

export default {
  getStudentCourseContext,
  getCourseStats,
  invalidateContextCache,
  invalidateCourseStatsCache,
};
