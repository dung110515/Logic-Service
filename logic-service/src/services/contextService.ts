import { prisma } from '../lib/prisma';
import { getRedisClient, isRedisConnected } from '../lib/redis';
import { AIContextData } from '../types';
import { REDIS_CACHE } from '../config/constants';

export const getStudentCourseContext = async (
  studentId: string,
  courseId: string,
  useCache = true
): Promise<AIContextData> => {
  try {

    if (useCache && isRedisConnected()) {
      const redis = getRedisClient();
      const cacheKey = `context:${studentId}:${courseId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit: ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    console.log(`🔄 Building context for student ${studentId} in course ${courseId}`);

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

    const documents = await prisma.document.findMany({
      where: { courseId },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    const assignments = await prisma.assignment.findMany({
      where: { courseId },
      select: {
        id: true,
        title: true,
        deadline: true,
        rubricUrl: true,
      },
      take: 10,
      orderBy: { deadline: 'asc' },
    });

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
      take: 20,
    });

    const students = enrollments.map(e => ({
      id: e.user.id,
      name: e.user.fullName,
      email: e.user.email || '',
    }));

    const context: AIContextData = {
      courseId,
      course: {
        name: course.name,
        code: course.code,
      },

      documents: documents.map(d => ({
        id: d.id,
        title: d.fileName,
        summary: `Document: ${d.fileName}`,
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

    if (isRedisConnected()) {
      const redis = getRedisClient();
      const cacheKey = `context:${studentId}:${courseId}`;
      const ttl = REDIS_CACHE.CONTEXT.ttl;
      await redis.setex(cacheKey, ttl, JSON.stringify(context));
      console.log(`💾 Cached context: ${cacheKey} (TTL: ${ttl}s)`);
    }

    console.log(`✅ Context built for ${studentId} in ${courseId}`);
    return context;
  } catch (error) {

    console.error('❌ Error building context:', error);
    throw error;
  }
};

export const getCourseStats = async (courseId: string): Promise<Record<string, any>> => {
  try {

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

    const enrollmentCount = await prisma.enrollment.count({
      where: { courseId },
    });

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

    if (isRedisConnected()) {
      const redis = getRedisClient();
      const ttl = REDIS_CACHE.COURSE_STATS.ttl;
      await redis.setex(cacheKey, ttl, JSON.stringify(stats));
      console.log(`💾 Cached stats: ${cacheKey} (TTL: ${ttl}s)`);
    }

    console.log(`✅ Stats calculated for ${courseId}`);
    return stats;
  } catch (error) {

    console.error('❌ Error calculating course stats:', error);
    throw error;
  }
};

export const invalidateContextCache = async (studentId: string, courseId: string): Promise<void> => {
  if (isRedisConnected()) {

    const redis = getRedisClient();
    const cacheKey = `context:${studentId}:${courseId}`;
    await redis.del(cacheKey);
    console.log(`🗑️ Context cache invalidated: ${cacheKey}`);
  }
};

export const invalidateCourseStatsCache = async (courseId: string): Promise<void> => {
  if (isRedisConnected()) {

    const redis = getRedisClient();
    const cacheKey = `course:stats:${courseId}`;
    await redis.del(cacheKey);
    console.log(`🗑️ Course stats cache invalidated: ${cacheKey}`);
  }
};

export default {
  getStudentCourseContext,
  getCourseStats,
  invalidateContextCache,
  invalidateCourseStatsCache,
};
