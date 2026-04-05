/**
 * Context Service - Xây Dựng Bối Cảnh Khóa Học Cho AI
 * ====================================================
 * 
 * Mục đích:
 * - Cung cấp thông tin chi tiết về khóa học cho AI Service
 * - Dùng bởi Q&A handler (để AI trả lời câu hỏi với context)
 * - Dùng bởi command handler (để sinh viên xem thống kê)
 * 
 * Data Được Tập Hợp:
 * ├── Course Info: Code, name, instructor
 * ├── Documents: Tài liệu khóa học (PDFs, slides)
 * ├── Assignments: Bài tập + deadline
 * ├── Student Grades: Điểm số hiện tại
 * ├── Submissions: Bài nộp (để kiểm tra tiến độ)
 * ├── Classmates: Danh sách sinh viên cùng lớp
 * └── Course Stats: Thống kê (avg grade, submission rate, etc.)
 * 
 * Caching Strategy:
 * - Redis cache: 24 hours (TTL: 86400s)
 * - Cache key: context:{studentId}:{courseId}
 * - Invalidate when: Assignment deadline, new document uploaded
 * 
 * Usage:
 * 1. contextHandler (Q&A) → calls getStudentCourseContext()
 * 2. commandHandler (/class_stats) → calls getCourseStats()
 * 3. AI Service → uses context để trả lời câu hỏi
 * 
 * Error Handling:
 * - Course không tìm thấy → throw error
 * - Redis down → fallback to database
 * - Database error → propagate to handler
 */

import { prisma } from '../lib/prisma';
import { getRedisClient, isRedisConnected } from '../lib/redis';
import { AIContextData } from '../types';
import { REDIS_CACHE } from '../config/constants';

/**
 * Lấy Context Cho Sinh Viên Trong Khóa Học
 * ========================================
 * 
 * Bao gồm: tài liệu, bài tập, điểm số, danh sách bạn cùng lớp
 * Dùng Redis cache để tối ưu performance
 * 
 * @param studentId - ID sinh viên
 * @param courseId - ID khóa học
 * @param useCache - Có dùng Redis cache không? (default: true)
 * @returns AIContextData - object chứa tất cả context data
 * @throws Error nếu course không tồn tại
 * 
 * @example
 * const context = await getStudentCourseContext('user-001', 'course-001');
 * console.log(context);
 * // {
 * //   course: { id, code, name },
 * //   documents: [...],
 * //   assignments: [...],
 * //   studentGrades: [...],
 * //   classmates: [...]
 * // }
 */
export const getStudentCourseContext = async (
  studentId: string,
  courseId: string,
  useCache = true
): Promise<AIContextData> => {
  try {
    // ===== Check Redis Cache =====
    // Nếu có cache, trả về ngay mà không query database
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

    // 1. Lấy thông tin khóa học
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    // Nếu course không tồn tại, throw error (handler sẽ catch)
    if (!course) {
      throw new Error(`Course ${courseId} not found`);
    }

    // 2. Lấy tài liệu khóa học (để AI tham khảo khi trả lời)
    const documents = await prisma.document.findMany({
      where: { courseId },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        // TODO: Thêm 'summary' field khi AI summarization completion
      },
      take: 10, // Limit to 10 latest documents
      orderBy: { createdAt: 'desc' }, // Newest first
    });

    // 3. Lấy danh sách bài tập (để AI biết deadline)
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

    // 4. Lấy danh sách bạn cùng lớp (enrollment students)
    // Dùng để: AI context (ai trong lớp), tính grade curve (so sánh điểm)
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
      take: 20, // Limit to 20 students (most recent enrollment)
    });

    // Format: [{id, name, email}, ...]
    const students = enrollments.map(e => ({
      id: e.user.id,
      name: e.user.fullName,
      email: e.user.email || '',
    }));

    // ===== Step 4: Dựng Context Object =====
    // Khép lại tất cả dữ liệu thành một object duy nhất
    // AI Service sẽ dùng object này để trả lời câu hỏi với context
    const context: AIContextData = {
      courseId,
      course: {
        name: course.name,
        code: course.code,
      },
      // Tài liệu: AI có thể tham khảo những docs này khi trả lời
      documents: documents.map(d => ({
        id: d.id,
        title: d.fileName,
        summary: `Document: ${d.fileName}`, // TODO: Use actual AI summary once available
        fileUrl: d.fileUrl, // Link để user download
      })),
      // Bài tập: AI có thể báo deadline sắp tới
      assignments: assignments.map(a => ({
        id: a.id,
        title: a.title,
        deadline: a.deadline.toISOString(), // ISO format để dễ parse
        rubricUrl: a.rubricUrl || undefined,
      })),
      // Danh sách bạn cùng lớp (nếu có feature grade curve)
      students,
    };

    // ===== Step 5: Cache Result Vào Redis =====
    // Lưu context vào Redis để request tiếp theo không cần rebuild
    // TTL: 24 hours (86400 giây)
    // Và invalidate khi: new document uploaded, assignment deadline changes
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const cacheKey = `context:${studentId}:${courseId}`;
      const ttl = REDIS_CACHE.CONTEXT.ttl; // 86400 seconds = 24 hours
      await redis.setex(cacheKey, ttl, JSON.stringify(context));
      console.log(`💾 Cached context: ${cacheKey} (TTL: ${ttl}s)`);
    }

    console.log(`✅ Context built for ${studentId} in ${courseId}`);
    return context;
  } catch (error) {
    // ===== Error Handling =====
    // Log error và throw để handler catch
    // Handler sẽ respond 500 nếu context build failed
    console.error('❌ Error building context:', error);
    throw error;
  }
};

/**
 * Lấy Thống Kê Khóa Học
 * =====================
 * 
 * Tính toán các metrics:
 * - Tổng số sinh viên đã enrollment
 * - Số lượng bài tập
 * - Tỉ lệ nộp bài (submission rate)
 * - Điểm trung bình (tuyệt đối + phần trăm)
 * 
 * Dùng bởi: commandHandler (/class_stats) → sinh viên xem thống kê lớp
 * 
 * Caching: 12 hours (43200 seconds)
 * - Invalidate khi: new assignment created, deadline updated
 * 
 * @param courseId - ID khóa học
 * @returns {{
 *   courseId: string,
 *   enrollmentCount: number,
 *   totalAssignments: number,
 *   submissionCount: number,
 *   submissionRate: number,
 *   avgScore: number,
 *   avgPercentage: number,
 *   gradeCount: number,
 *   timestamp: string
 * }} Thống kê khóa học
 * 
 * @example
 * const stats = await getCourseStats('course-001');
 * // {
 * //   enrollmentCount: 30,
 * //   totalAssignments: 5,
 * //   submissionCount: 140,
 * //   submissionRate: 93.33,
 * //   avgScore: 82.5,
 * //   avgPercentage: 82.5,
 * //   gradeCount: 140
 * // }
 */
export const getCourseStats = async (courseId: string): Promise<Record<string, any>> => {
  try {
    // ===== Step 1: Check Redis Cache =====
    // Nếu stats đã được tính, trả về luôn (avoid expensive calculations)
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

    // ===== Step 2: Fetch Base Data =====
    // Lấy số lượng enrollment (tổng sinh viên)
    const enrollmentCount = await prisma.enrollment.count({
      where: { courseId },
    });

    // Lấy tất cả grade records trong khóa học
    // Mỗi grade tương ứng với 1 submission đã được grade
    const grades = await prisma.grade.findMany({
      where: {
        submission: {
          assignment: { courseId }, // Filter by course
        },
      },
      select: { 
        score: true, // Điểm thực tế
        submission: {
          select: {
            assignment: {
              select: { maxScore: true } // Max điểm để tính %
            }
          }
        }
      },
    });

    // ===== Step 3: Calculate Average Scores =====
    // Tính điểm trung bình (tuyệt đối)
    const avgScore =
      grades.length > 0
        ? grades.reduce((sum, g) => sum + g.score, 0) / grades.length
        : 0;

    // Tính điểm trung bình (phần trăm)
    // Vì mỗi assignment có maxScore khác nhau
    const avgPercentage =
      grades.length > 0
        ? (grades.reduce((sum, g) => sum + (g.score / g.submission.assignment.maxScore) * 100, 0) /
            grades.length)
        : 0;

    // ===== Step 4: Calculate Submission Rate =====
    // Total assignments trong khóa học
    const totalAssignments = await prisma.assignment.count({
      where: { courseId },
    });

    // Total submissions (có thể > totalAssignments nếu student submit multiple times)
    const submissions = await prisma.submission.count({
      where: {
        assignment: { courseId },
      },
    });

    // Submission rate = (submissions / (enrolled_students * total_assignments)) * 100
    // VD: 140 submissions / (30 students * 5 assignments) = 93.33%
    const submissionRate =
      totalAssignments > 0 ? (submissions / (enrollmentCount * totalAssignments)) * 100 : 0;

    // ===== Step 5: Build Stats Object =====
    const stats = {
      courseId,
      enrollmentCount, // 30 sinh viên
      totalAssignments, // 5 bài tập
      submissionCount: submissions, // 140 lần nộp
      submissionRate: parseFloat(submissionRate.toFixed(2)), // 93.33%
      avgScore: parseFloat(avgScore.toFixed(2)), // 82.50
      avgPercentage: parseFloat(avgPercentage.toFixed(2)), // 82.50%
      gradeCount: grades.length, // Số submission đã được grade
      timestamp: new Date().toISOString(), // Khi stats được generate
    };

    // ===== Step 6: Cache Stats Result =====
    // Lưu vào Redis để request tiếp theo nhanh hơn
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const ttl = REDIS_CACHE.COURSE_STATS.ttl; // 12 hours
      await redis.setex(cacheKey, ttl, JSON.stringify(stats));
      console.log(`💾 Cached stats: ${cacheKey} (TTL: ${ttl}s)`);
    }

    console.log(`✅ Stats calculated for ${courseId}`);
    return stats;
  } catch (error) {
    // ===== Error Handling =====
    console.error('❌ Error calculating course stats:', error);
    throw error; // Handler sẽ catch và respond 500
  }
};

/**
 * Invalidate Context Cache Cho Sinh Viên
 * =====================================
 * 
 * Xóa cached context khi có dữ liệu thay đổi:
 * - Document mới được upload
 * - Assignment deadline thay đổi
 * - New submission added
 * 
 * Dùng bởi: documentHandler, assignmentHandler, submissionHandler
 * 
 * @param studentId - ID sinh viên
 * @param courseId - ID khóa học
 * @returns Promise<void>
 * 
 * @example
 * // Khi document mới được upload, clear cache
 * await invalidateContextCache('user-001', 'course-001');
 */
export const invalidateContextCache = async (studentId: string, courseId: string): Promise<void> => {
  if (isRedisConnected()) {
    // ===== Delete Cache Key =====
    // Xóa Redis cache entry để request tiếp theo rebuild context từ database
    const redis = getRedisClient();
    const cacheKey = `context:${studentId}:${courseId}`;
    await redis.del(cacheKey);
    console.log(`🗑️ Context cache invalidated: ${cacheKey}`);
  }
};

/**
 * Invalidate Course Stats Cache
 * =============================
 * 
 * Xóa cached stats khi có thay đổi:
 * - Assignment mới thêm (total assignments change)
 * - Submission deadline thay đổi
 * - Grading hoàn thành (average score update)
 * 
 * Dùng bởi: assignmentHandler, gradeHandler
 * 
 * @param courseId - ID khóa học
 * @returns Promise<void>
 * 
 * @example
 * // Khi assignment mới được tạo, clear stats cache
 * await invalidateCourseStatsCache('course-001');
 */
export const invalidateCourseStatsCache = async (courseId: string): Promise<void> => {
  if (isRedisConnected()) {
    // ===== Delete Cache Key =====
    // Xóa Redis cache entry để request tiếp theo recalculate stats
    const redis = getRedisClient();
    const cacheKey = `course:stats:${courseId}`;
    await redis.del(cacheKey);
    console.log(`🗑️ Course stats cache invalidated: ${cacheKey}`);
  }
};

/**
 * Export All Functions
 * 
 * Used by: contextHandler, commandHandler, other services
 */
export default {
  getStudentCourseContext,
  getCourseStats,
  invalidateContextCache,
  invalidateCourseStatsCache,
};
