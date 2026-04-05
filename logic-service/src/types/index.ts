export interface KafkaBasePayload {

  timestamp: number;

  source: string;

  messageId: string;

  data: Record<string, any>;
}

export interface FileUploadedPayload extends KafkaBasePayload {
  data: {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
    courseId: string;
    uploadedAt: string;
  };
}

export interface SubmissionCreatedPayload extends KafkaBasePayload {
  data: {
    submissionId: string;
    studentId: string;
    assignmentId: string;
    courseId: string;
    content: string;
    fileUrl?: string;
    submittedAt: string;
  };
}

export interface CommandRequestedPayload extends KafkaBasePayload {
  data: {
    commandId: string;
    commandName: string;
    userId: string;
    courseId?: string;
    args: Record<string, any>;
  };
}

export interface TicketCreatedPayload extends KafkaBasePayload {
  data: {
    ticketId: string;
    studentId: string;
    courseId: string;
    title: string;
    question: string;
    createdAt: string;
  };
}

export interface AIResponseQuizPayload extends KafkaBasePayload {
  data: {
    quizId: string;
    courseId: string;
    createdBy: string;
    questions: Array<{
      content: string;
      options: string[];
      correctAnswer: number;
    }>;
  };
}

export interface AIResponseGradePayload extends KafkaBasePayload {
  data: {
    gradeId: string;
    submissionId: string;
    score: number;
    feedback: string;
    gradedAt: string;
  };
}

export interface WebQuizSubmittedPayload extends KafkaBasePayload {
  data: {
    submissionId: string;
    studentId: string;
    quizId: string;
    courseId: string;
    answers: Record<string, any>;
    submittedAt: string;
  };
}

export interface AIRequestAnswerTicketPayload extends KafkaBasePayload {
  data: {
    ticketId: string;
    question: string;
    courseContext: string;
  };
}

export interface AIRequestSummarizeDocPayload extends KafkaBasePayload {
  data: {
    documentId: string;
    courseId: string;
    content: string;
    language: string;
  };
}

export interface NotificationSendDMPayload extends KafkaBasePayload {
  data: {
    userId: string;
    title: string;
    content: string;
    link?: string;
  };
}

export interface ProcessSubmissionPayload extends KafkaBasePayload {
  data: {
    submissionId: string;
    studentId: string;
    assignmentId: string;
    courseId: string;
    processedAt: string;
  };
}

export interface ProcessGradePayload extends KafkaBasePayload {
  data: {
    gradeId: string;
    studentId: string;
    assignmentId: string;
    courseId: string;
    score: number;
    maxScore: number;
    gradedAt: string;
  };
}

export interface DiscordResponsePayload extends KafkaBasePayload {
  data: {
    userId: string;
    commandId: string;
    status: 'success' | 'error';
    message: string;
    payload?: Record<string, any>;
  };
}

export type ConsumedKafkaMessage =
  | FileUploadedPayload
  | SubmissionCreatedPayload
  | CommandRequestedPayload
  | TicketCreatedPayload
  | AIResponseQuizPayload
  | AIResponseGradePayload
  | WebQuizSubmittedPayload;

export type ProducedKafkaMessage =
  | AIRequestAnswerTicketPayload
  | AIRequestSummarizeDocPayload
  | NotificationSendDMPayload
  | ProcessSubmissionPayload
  | ProcessGradePayload
  | DiscordResponsePayload;

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

export interface PaginatedAPIResponse<T = any> extends APIResponse<T> {

  meta?: {

    total: number;

    page: number;

    pageSize: number;

    totalPages: number;
  };
}

export interface HealthCheckResponse {

  status: 'ok' | 'error';

  timestamp: string;

  uptime: number;

  services: {

    database: 'connected' | 'disconnected';

    redis: 'connected' | 'disconnected';

    kafka: 'connected' | 'disconnected';
  };
}

export interface UserDTO {

  id: string;

  email: string;

  role: 'student' | 'teacher' | 'admin';

  name: string;

  createdAt: string;

  updatedAt: string;
}

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

export interface SheetsSyncConfig {

  sheetId: string;

  worksheetName: string;

  headers: string[];

  range: string;
}

export type CacheKey =
  | `context:course:${string}`
  | `course:${string}`
  | `user:${string}`
  | `quiz:${string}`
  | `submissions:course:${string}`
  | `grades:student:${string}`;

export interface ServiceTokenPayload {

  service: string;

  userId?: string;

  timestamp: number;

  signature: string;
}

export interface AuthenticatedRequest {

  service: string;

  userId?: string;

  isInternal: boolean;
}

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

export class ValidationError extends LogicServiceError {
  constructor(message: string, details?: string) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends LogicServiceError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} không tìm thấy`, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends LogicServiceError {
  constructor(message: string = 'Không được phép truy cập') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}
