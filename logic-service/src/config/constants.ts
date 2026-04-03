/**
 * Hằng số toàn cục cho Logic Service
 * Bao gồm: Kafka topics, Redis TTL, Kafka consumer group
 */

// ============================================
// KAFKA TOPICS
// ============================================

/**
 * Các topic Kafka được tiêu thụ (receive) từ các service khác
 */
export const KAFKA_TOPICS_CONSUME = {
  // Từ Discord Proxy Service
  FILE_UPLOADED: 'lms.discord.file.uploaded',           // File GV upload
  SUBMISSION_CREATED: 'lms.discord.submission.created', // SV nộp bài
  COMMAND_REQUESTED: 'lms.discord.command.requested',   // Slash command
  TICKET_CREATED: 'lms.discord.ticket.created',         // Phiếu hỏi đáp mới

  // Từ AI Service
  AI_RESPONSE_QUIZ: 'lms.ai.response.quiz',             // AI tạo xong quiz
  AI_RESPONSE_GRADE: 'lms.ai.response.grade',           // AI chấm xong

  // Từ Web Service
  WEB_QUIZ_SUBMITTED: 'lms.web.quiz.submitted',         // SV nộp quiz qua Web
} as const;

/**
 * Các topic Kafka được sản xuất (produce) gửi cho các service khác
 */
export const KAFKA_TOPICS_PRODUCE = {
  // Cho AI Service
  AI_REQUEST_ANSWER_TICKET: 'lms.ai.request.answer_ticket',     // Yêu cầu AI trả lời Q&A
  AI_REQUEST_SUMMARIZE_DOC: 'lms.ai.request.summarize_doc',     // Yêu cầu AI tóm tắt tài liệu

  // Cho Notification Service
  NOTIFICATION_SEND_DM: 'lms.notification.send.dm',             // Gửi tin nhắn riêng

  // Cho Analytics Service
  PROCESS_SUBMISSION: 'lms.logic.process.submission',           // Báo SV nộp bài
  PROCESS_GRADE: 'lms.logic.process.grade',                     // Báo GV chấm xong

  // Cho Discord Proxy Service (trả lời lựa chọn)
  DISCORD_RESPONSE: 'lms.discord.response',                      // Trả dữ liệu về Bot
} as const;

/**
 * Tất cả topics (consume + produce) - dùng để validate, logging
 */
export const KAFKA_TOPICS = {
  ...KAFKA_TOPICS_CONSUME,
  ...KAFKA_TOPICS_PRODUCE,
} as const;

// ============================================
// KAFKA CONSUMER CONFIGURATION
// ============================================

/**
 * Nhóm Kafka Consumer - định danh cho Logic Service
 * Tất cả instances của Logic Service sẽ dùng group này
 * Kafka sẽ auto-load-balance messages giữa các instances
 */
export const KAFKA_CONSUMER_GROUP = 'logic-service-group' as const;

/**
 * Tất cả topics cần subscribe/consume
 */
export const KAFKA_TOPICS_SUBSCRIBE = Object.values(KAFKA_TOPICS_CONSUME);

// ============================================
// REDIS CACHE TTL (Time To Live - giây)
// ============================================

/**
 * Cấu hình cache Redis
 * Key format: [pattern]:{id}
 * TTL: tính bằng giây (TTL = số giây cache tồn tại)
 */
export const REDIS_CACHE = {
  /**
   * Course mapping: Discord Server ID → Course ID
   * Dùng trong documentHandler, submissionHandler
   * TTL: 5 phút (thường ít thay đổi)
   */
  COURSE_SERVER: {
    pattern: 'course:server:{discordServerId}',
    ttl: 5 * 60, // 300 giây = 5 phút
  },

  /**
   * User mapping: Discord ID → User ID
   * Dùng trong tất cả handlers (lookup user từ Discord ID)
   * TTL: 10 phút (trung bình, user không thường thay đổi)
   */
  USER_DISCORD: {
    pattern: 'user:discord:{discordId}',
    ttl: 10 * 60, // 600 giây = 10 phút
  },

  /**
   * Q&A Answer cache: hash(question) → AI answer
   * Dùng trong contextHandler để tránh gọi AI lại với câu hỏi trùng
   * TTL: 1 giờ (câu trả lời ổn định, không thường thay đổi)
   */
  QA_ANSWER: {
    pattern: 'qa:cache:{questionHash}',
    ttl: 60 * 60, // 3600 giây = 1 giờ
  },

  /**
   * Course stats: thống kê lớp (tổng SV, avg score, submission rate)
   * Dùng trong commandHandler (/class_stats), courses routes (GET /courses/:id/stats)
   * TTL: 2 phút (thay đổi thường xuyên khi có grade/submission mới)
   */
  COURSE_STATS: {
    pattern: 'course:stats:{courseId}',
    ttl: 2 * 60, // 120 giây = 2 phút
  },

  /**
   * Context cache: các dữ liệu context cho AI
   * Dùng trong contextService
   * TTL: 5 phút
   */
  CONTEXT: {
    pattern: 'context:{studentId}:{courseId}',
    ttl: 5 * 60, // 300 giây = 5 phút
  },
} as const;

// ============================================
// HANDLER ROUTING - MAP TOPIC → HANDLER
// ============================================

/**
 * Map mỗi Kafka topic tới handler function
 * Dùng trong kafka/consumer.ts để route message
 */
export const KAFKA_HANDLER_MAP = {
  [KAFKA_TOPICS_CONSUME.FILE_UPLOADED]: 'documentHandler',
  [KAFKA_TOPICS_CONSUME.SUBMISSION_CREATED]: 'submissionHandler',
  [KAFKA_TOPICS_CONSUME.COMMAND_REQUESTED]: 'commandHandler',
  [KAFKA_TOPICS_CONSUME.TICKET_CREATED]: 'contextHandler',
  [KAFKA_TOPICS_CONSUME.AI_RESPONSE_QUIZ]: 'aiQuizHandler',
  [KAFKA_TOPICS_CONSUME.AI_RESPONSE_GRADE]: 'gradeHandler',
  [KAFKA_TOPICS_CONSUME.WEB_QUIZ_SUBMITTED]: 'quizHandler',
} as const;

// ============================================
// ERROR RETRY CONFIGURATION
// ============================================

/**
 * Cấu hình retry cho Kafka + Database
 */
export const RETRY_CONFIG = {
  /**
   * Số lần thử lại khi DB hoặc Kafka bị lỗi
   */
  MAX_RETRIES: 3,

  /**
   * Delay exponential backoff: 1s → 2s → 4s
   * Công thức: baseDelay * (2 ^ attempt)
   */
  BASE_DELAY_MS: 1000, // 1 giây

  /**
   * Max delay tối đa giữa các lần retry (không vô hạn)
   */
  MAX_DELAY_MS: 30000, // 30 giây
} as const;

// ============================================
// API CONFIGURATION
// ============================================

/**
 * Cấu hình cho REST API
 */
export const API_CONFIG = {
  /**
   * Timeout cho API request (ms)
   */
  REQUEST_TIMEOUT_MS: 30000, // 30 giây

  /**
   * Max size của request body (JSON)
   */
  MAX_REQUEST_SIZE: '10mb',

  /**
   * Các endpoint không cần auth (public)
   */
  PUBLIC_ENDPOINTS: [
    '/health',
    '/health/ready',
    '/health/live',
  ],
} as const;

// ============================================
// LOGGING CONFIGURATION
// ============================================

/**
 * Cấu hình cho Winston logger
 */
export const LOGGER_CONFIG = {
  /**
   * Log level: error < warn < info < debug
   */
  LEVEL: process.env.NODE_ENV === 'production' ? 'warn' : 'info',

  /**
   * Format: json trong production, pretty-print trong dev
   */
  FORMAT: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',

  /**
   * File logging
   */
  FILES: {
    error: 'logs/error.log',
    combined: 'logs/combined.log',
  },
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

/**
 * Type cho KAFKA topics
 */
export type KafkaTopic = typeof KAFKA_TOPICS[keyof typeof KAFKA_TOPICS];

/**
 * Type cho Redis cache patterns
 */
export type RedisCacheKey = keyof typeof REDIS_CACHE;
