/**
 * TypeScript Types & Interfaces
 * Định nghĩa kiểu dữ liệu cho Kafka messages, API responses, services
 */

// ============================================
// KAFKA MESSAGE TYPES
// ============================================

/**
 * Base type cho tất cả Kafka messages
 * Bắt buộc có: timestamp, source service, ...
 */
export interface KafkaBasePayload {
  /**
   * Timestamp khi message được tạo (milliseconds)
   */
  timestamp: number;

  /**
   * Service nào gửi message này
   * Ví dụ: 'discord-proxy', 'ai-service', 'web-service'
   */
  source: string;

  /**
   * ID duy nhất của message (để tracking, deduplication)
   */
  messageId: string;

  /**
   * Dữ liệu kèm theo message
   */
  data: Record<string, any>;
}

// ===== CONSUMED MESSAGES (từ service khác) =====

/**
 * discord.file.uploaded
 * Khi GV upload file lên Discord → Discord Proxy → Kafka
 */
export interface FileUploadedPayload extends KafkaBasePayload {
  data: {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string; // User ID
    courseId: string;
    uploadedAt: string; // ISO date
  };
}

/**
 * discord.submission.created
 * Khi SV nộp bài trên Discord → Discord Proxy → Kafka
 */
export interface SubmissionCreatedPayload extends KafkaBasePayload {
  data: {
    submissionId: string;
    studentId: string;
    assignmentId: string;
    courseId: string;
    content: string; // Nội dung nộp bài
    fileUrl?: string; // Link file nếu có
    submittedAt: string; // ISO date
  };
}

/**
 * discord.command.requested
 * Khi SV dùng slash command trên Discord
 */
export interface CommandRequestedPayload extends KafkaBasePayload {
  data: {
    commandId: string;
    commandName: string;
    userId: string;
    courseId?: string;
    args: Record<string, any>; // Tham số lệnh
  };
}

/**
 * discord.ticket.created
 * Khi SV tạo phiếu Q&A mới
 */
export interface TicketCreatedPayload extends KafkaBasePayload {
  data: {
    ticketId: string;
    studentId: string;
    courseId: string;
    title: string;
    question: string;
    createdAt: string; // ISO date
  };
}

/**
 * ai.response.quiz
 * Khi AI Service tạo xong quiz
 */
export interface AIResponseQuizPayload extends KafkaBasePayload {
  data: {
    quizId: string;
    courseId: string;
    createdBy: string; // Teacher ID
    questions: Array<{
      content: string;
      options: string[];
      correctAnswer: number; // Index
    }>;
  };
}

/**
 * ai.response.grade
 * Khi AI Service chấm xong bài tập/quiz
 */
export interface AIResponseGradePayload extends KafkaBasePayload {
  data: {
    gradeId: string;
    submissionId: string;
    score: number;
    feedback: string;
    gradedAt: string; // ISO date
  };
}

/**
 * web.quiz.submitted
 * Khi SV nộp quiz qua Web Service
 */
export interface WebQuizSubmittedPayload extends KafkaBasePayload {
  data: {
    submissionId: string;
    studentId: string;
    quizId: string;
    courseId: string;
    answers: Record<string, any>;
    submittedAt: string; // ISO date
  };
}

// ===== PRODUCED MESSAGES (gửi cho service khác) =====

/**
 * ai.request.answer_ticket
 * Yêu cầu AI Service trả lời Q&A
 */
export interface AIRequestAnswerTicketPayload extends KafkaBasePayload {
  data: {
    ticketId: string;
    question: string;
    courseContext: string; // Tóm tắt nội dung khóa học
  };
}

/**
 * ai.request.summarize_doc
 * Yêu cầu AI Service tóm tắt tài liệu
 */
export interface AIRequestSummarizeDocPayload extends KafkaBasePayload {
  data: {
    documentId: string;
    courseId: string;
    content: string;
    language: string; // 'vi' | 'en'
  };
}

/**
 * notification.send.dm
 * Gửi tin nhắn riêng cho user
 */
export interface NotificationSendDMPayload extends KafkaBasePayload {
  data: {
    userId: string;
    title: string;
    content: string;
    link?: string; // Deep link (optional)
  };
}

/**
 * logic.process.submission
 * Báo Analytics Service rằng SV nộp bài
 */
export interface ProcessSubmissionPayload extends KafkaBasePayload {
  data: {
    submissionId: string;
    studentId: string;
    assignmentId: string;
    courseId: string;
    processedAt: string; // ISO date
  };
}

/**
 * logic.process.grade
 * Báo Analytics Service rằng GV chấm xong
 */
export interface ProcessGradePayload extends KafkaBasePayload {
  data: {
    gradeId: string;
    studentId: string;
    assignmentId: string;
    courseId: string;
    score: number;
    maxScore: number;
    gradedAt: string; // ISO date
  };
}

/**
 * discord.response
 * Phản hồi (dữ liệu) về cho Discord
 */
export interface DiscordResponsePayload extends KafkaBasePayload {
  data: {
    userId: string;
    commandId: string;
    status: 'success' | 'error';
    message: string;
    payload?: Record<string, any>;
  };
}

// ===== UNION TYPE cho tất cả consumed messages =====
export type ConsumedKafkaMessage =
  | FileUploadedPayload
  | SubmissionCreatedPayload
  | CommandRequestedPayload
  | TicketCreatedPayload
  | AIResponseQuizPayload
  | AIResponseGradePayload
  | WebQuizSubmittedPayload;

// ===== UNION TYPE cho tất cả produced messages =====
export type ProducedKafkaMessage =
  | AIRequestAnswerTicketPayload
  | AIRequestSummarizeDocPayload
  | NotificationSendDMPayload
  | ProcessSubmissionPayload
  | ProcessGradePayload
  | DiscordResponsePayload;

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Base API response format
 * Tất cả endpoint phải trả về format này
 */
export interface APIResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  error?: {
    code: string;
    details?: string;
  };
}

/**
 * Paginated API response
 */
export interface PaginatedAPIResponse<T = any> extends APIResponse<T> {
  meta?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ===== Health Check Response =====
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string; // ISO date
  uptime: number; // milliseconds
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
    kafka: 'connected' | 'disconnected';
  };
}

// ===== User Responses =====
export interface UserDTO {
  id: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  name: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Course Responses =====
export interface CourseDTO {
  id: string;
  code: string;
  name: string;
  instructorId: string;
  description?: string;
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
}

// ===== Grade Responses =====
export interface GradeDTO {
  id: string;
  studentId: string;
  assignmentId: string;
  score: number;
  maxScore: number;
  feedback?: string;
  gradedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// SERVICE TYPES
// ============================================

/**
 * Context cho AI reasoning
 * Dùng bởi contextService
 */
export interface AIContextData {
  courseId: string;
  course: {
    name: string;
    code: string;
    description?: string;
  };
  documents: Array<{
    id: string;
    title: string;
    summary: string;
    fileUrl: string;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    deadline: string;
    rubricUrl?: string;
  }>;
  students: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

/**
 * Google Sheets sync config
 * Dùng bởi sheetsService
 */
export interface SheetsSyncConfig {
  sheetId: string;
  worksheetName: string;
  headers: string[];
  range: string; // A1:Z100
}

// ============================================
// CACHE KEY TYPES
// ============================================

/**
 * Type-safe Redis cache keys
 * Tránh lỗi key string typo
 */
export type CacheKey =
  | `context:course:${string}` // context:course:{courseId}
  | `course:${string}` // course:{courseId}
  | `user:${string}` // user:{userId}
  | `quiz:${string}` // quiz:{quizId}
  | `submissions:course:${string}` // submissions:course:{courseId}
  | `grades:student:${string}`; // grades:student:{studentId}

// ============================================
// AUTHENTICATION TYPES
// ============================================

/**
 * Service Token Payload (từ X-Service-Token header)
 * Dùng để xác thực request giữa các service
 */
export interface ServiceTokenPayload {
  service: string; // Tên service gửi request
  userId?: string; // User ID (optional)
  timestamp: number;
  signature: string; // HMAC signature
}

/**
 * Authenticated Request (sử dụng trong middleware)
 */
export interface AuthenticatedRequest {
  service: string;
  userId?: string;
  isInternal: boolean; // True nếu từ service khác, false nếu từ client
}

// ============================================
// ERROR TYPES
// ============================================

/**
 * Custom Error class cho Logic Service
 */
export class LogicServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: string
  ) {
    super(message);
    this.name = 'LogicServiceError';
  }
}

/**
 * Validation Error
 */
export class ValidationError extends LogicServiceError {
  constructor(message: string, details?: string) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends LogicServiceError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} không tìm thấy`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized Error
 */
export class UnauthorizedError extends LogicServiceError {
  constructor(message: string = 'Không được phép truy cập') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}
