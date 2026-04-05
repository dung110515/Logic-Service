/**
 * TypeScript Types & Interfaces
 * =============================
 * 
 * Mục đích:
 * - Define all TypeScript types used throughout the service
 * - Type-safe Kafka message payloads
 * - API request/response formats
 * - Service-to-service communication contracts
 * - Error classes for consistent error handling
 * - Database entity DTOs
 * 
 * Benefits of Centralized Types:
 * ✅ Single source of truth (no duplicate type definitions)
 * ✅ Type-safe message handling (catches Kafka payload errors at compile time)
 * ✅ IDE autocomplete (import types anywhere)
 * ✅ Consistency across services (external services can import from here)
 * ✅ Documentation (each interface documents expected structure)
 * 
 * Type Hierarchy:
 * 
 * KafkaBasePayload (base)
 *   ├─ FileUploadedPayload (consumed)
 *   ├─ SubmissionCreatedPayload (consumed)
 *   ├─ AIRequestAnswerTicketPayload (produced)
 *   ├─ NotificationSendDMPayload (produced)
 *   └─ ... (10+ more)
 * 
 * Usage:
 * ```typescript
 * // In handlers
 * import { SubmissionCreatedPayload } from '../types';
 * 
 * export default async (payload: SubmissionCreatedPayload) => {
 *   // TypeScript knows payload.data.submissionId exists
 *   const {submissionId, studentId} = payload.data;
 * }
 * 
 * // In routes
 * import { CourseDTO, APIResponse } from '../types';
 * 
 * const response: APIResponse<CourseDTO> = {
 *   success: true,
 *   statusCode: 200,
 *   data: course
 * };
 * ```
 */

// ============================================
// KAFKA MESSAGE TYPES
// ============================================

/**
 * Base Structure for All Kafka Messages
 * =======================================
 * 
 * Every Kafka message MUST extend this interface
 * Ensures consistency: timestamp, source tracking, deduplication
 * 
 * Properties:
 * - timestamp: When message was created (for ordering/deduplication)
 * - source: Which microservice published this message
 * - messageId: Unique ID (prevents duplicate processing if consumed twice)
 * - data: The actual payload (varies by message type)
 * 
 * Deduplication Example:
 * Message sent with messageId: "grade-001-1234"
 * Consumer receives: checks if "grade-001-1234" processed before
 * If yes: skips (idempotent)
 * If no: processes and marks as processed
 */
export interface KafkaBasePayload {
  /**
   * Timestamp when message was created
   * Type: milliseconds since epoch (Date.now())
   * Used: ordering messages, tracking latency
   * Example: 1704067200000
   */
  timestamp: number;

  /**
   * Which microservice published this message
   * Type: string identifier of source service
   * Examples: 'discord-service', 'ai-service', 'web-service', 'logic-service'
   * Used: tracking message origin, routing, debugging
   */
  source: string;

  /**
   * Unique message identifier for deduplication
   * Type: unique string (must be unique across all messages)
   * Format: typically "{timestamp}-{random}" or UUID
   * Used: if message consumed twice, system detects duplicate
   * Example: "1704067200000-abc123"
   */
  messageId: string;

  /**
   * The actual message payload
   * Type: Record<string, any> (specific type depends on message type)
   * Examples:
   * - FileUploadedPayload: {fileId, fileName, uploadedBy, ...}
   * - SubmissionCreatedPayload: {studentId, assignmentId, content, ...}
   * - NotificationSendDMPayload: {userId, title, content, link, ...}
   */
  data: Record<string, any>;
}

// ===== CONSUMED MESSAGES (Events from Other Services) =====
// These messages are RECEIVED by this service from other microservices

/**
 * FILE_UPLOADED - Discord Service → Logic Service
 * ================================================
 * Triggered: When user uploads file via Discord bot
 * Handler: documentHandler.ts
 * 
 * Workflow:
 * 1. User uploads PDF in Discord #documents channel
 * 2. Discord Bot saves to storage
 * 3. Publishes FILE_UPLOADED to Kafka
 * 4. Logic Service receives, saves metadata to DB
 * 5. (Optional) sends to AI Service for summarization
 * 6. (Optional) backs up to MinIO object storage
 * 
 * Example Message:
 * {
 *   "source": "discord-service",
 *   "timestamp": 1704067200000,
 *   "messageId": "file-001-1234",
 *   "data": {
 *     "fileId": "file-67890",
 *     "fileName": "lecture-notes-2024.pdf",
 *     "fileSize": 2048576,
 *     "mimeType": "application/pdf",
 *     "uploadedBy": "user-123",
 *     "courseId": "course-CS101",
 *     "uploadedAt": "2024-01-15T10:00:00Z"
 *   }
 * }
 */
export interface FileUploadedPayload extends KafkaBasePayload {
  data: {
    fileId: string;           // Unique file identifier
    fileName: string;         // Original filename (e.g., "lecture.pdf")
    fileSize: number;        // Bytes
    mimeType: string;        // e.g., "application/pdf", "image/png"
    uploadedBy: string;      // User ID who uploaded
    courseId: string;        // Which course file is for
    uploadedAt: string;      // ISO 8601 timestamp
  };
}

/**
 * SUBMISSION_CREATED - Discord Service → Logic Service
 * ===================================================
 * Triggered: When student submits assignment via Discord
 * Handler: submissionHandler.ts
 * 
 * Workflow:
 * 1. Student submits via Discord /submit command or button
 * 2. Discord Bot validates and captures submission
 * 3. Publishes SUBMISSION_CREATED to Kafka
 * 4. Logic Service receives, saves to database
 * 5. Updates submission status to SUBMITTED
 * 6. Publishes PROCESS_SUBMISSION to Analytics Service
 * 
 * Example Message:
 * {
 *   "source": "discord-service",
 *   "data": {
 *     "submissionId": "sub-001",
 *     "studentId": "user-123",
 *     "assignmentId": "assign-001",
 *     "courseId": "course-CS101",
 *     "content": "My solution code here...",
 *     "fileUrl": "https://storage/submission-001.pdf",
 *     "submittedAt": "2024-01-25T15:30:00Z"
 *   }
 * }
 */
export interface SubmissionCreatedPayload extends KafkaBasePayload {
  data: {
    submissionId: string;     // Unique submission ID
    studentId: string;        // Student user ID
    assignmentId: string;     // Which assignment being submitted for
    courseId: string;         // Which course
    content: string;          // Submission content/code
    fileUrl?: string;         // URL to attached file (optional)
    submittedAt: string;      // ISO 8601 timestamp
  };
}

/**
 * COMMAND_REQUESTED - Discord Service → Logic Service
 * ==================================================
 * Triggered: When student uses slash command in Discord
 * Handler: commandHandler.ts
 * 
 * Supported Commands:
 * - /grades [courseCode] → show student's grades in course
 * - /my_assignments → show student's pending assignments
 * - /class_stats → show course statistics
 * 
 * Workflow:
 * 1. Student types /grades CS101 in Discord
 * 2. Discord Bot publishes COMMAND_REQUESTED
 * 3. Logic Service executes command (queries DB)
 * 4. Publishesresults back via DISCORD_RESPONSE
 * 5. Discord Bot shows formatted results to student
 * 
 * Example Message:
 * {
 *   "source": "discord-service",
 *   "data": {
 *     "commandId": "cmd-001",
 *     "commandName": "grades",
 *     "userId": "user-123",
 *     "courseId": "course-CS101",
 *     "args": {"course": "CS101", "limit": 10}
 *   }
 * }
 */
export interface CommandRequestedPayload extends KafkaBasePayload {
  data: {
    commandId: string;        // Unique command execution ID
    commandName: string;      // e.g., "grades", "assignments", "stats"
    userId: string;           // User who ran command
    courseId?: string;        // Context course (optional)
    args: Record<string, any>;// Command arguments parsed
  };
}

/**
 * TICKET_CREATED - Discord Service → Logic Service
 * ==================================================
 * Triggered: When student asks Q&A question
 * Handler: contextHandler.ts
 * 
 * Workflow:
 * 1. Student posts question in #qa-channel
 * 2. Discord Bot captures question
 * 3. Publishes TICKET_CREATED to Kafka
 * 4. Logic Service receives, saves to DB
 * 5. Fetches course context (documents, assignments, etc)
 * 6. Publishes AI_REQUEST_ANSWER_TICKET to AI Service
 * 7. AI Service generates answer, publishes back
 * 8. Logic Service notifies student
 * 
 * Example Message:
 * {
 *   "source": "discord-service",
 *   "data": {
 *     "ticketId": "ticket-001",
 *     "studentId": "user-123",
 *     "courseId": "course-CS101",
 *     "title": "How to implement binary search?",
 *     "question": "Can anyone explain binary search algorithm with example?",
 *     "createdAt": "2024-01-25T14:20:00Z"
 *   }
 * }
 */
export interface TicketCreatedPayload extends KafkaBasePayload {
  data: {
    ticketId: string;         // Unique question ID
    studentId: string;        // Student who asked
    courseId: string;         // Course context
    title: string;            // Question title/summary
    question: string;         // Full question text
    createdAt: string;        // ISO 8601 timestamp
  };
}

/**
 * AI_RESPONSE_QUIZ - AI Service → Logic Service
 * =============================================
 * Triggered: When AI Service finishes generating quiz
 * Handler: aiQuizHandler.ts
 * 
 * Workflow:
 * 1. Teacher requests AI generate quiz for topic
 * 2. AI Service generates questions
 * 3. Publishes AI_RESPONSE_QUIZ to Kafka
 * 4. Logic Service receives, saves quiz as DRAFT
 * 5. Notifies teacher for review before publishing
 * 6. Teacher reviews/approves quiz
 * 7. Quiz published to students
 * 
 * Example Message:
 * {
 *   "source": "ai-service",
 *   "data": {
 *     "quizId": "quiz-ai-001",
 *     "courseId": "course-CS101",
 *     "createdBy": "teacher-123",
 *     "questions": [
 *       {
 *         "content": "What is O(n^2)?",
 *         "options": ["Linear", "Quadratic", "Square", "Instant"],
 *         "correctAnswer": 1
 *       }
 *     ]
 *   }
 * }
 */
export interface AIResponseQuizPayload extends KafkaBasePayload {
  data: {
    quizId: string;           // AI-generated quiz ID
    courseId: string;         // Course context
    createdBy: string;        // Teacher who requested
    questions: Array<{
      content: string;        // Question text
      options: string[];      // Multiple choice options
      correctAnswer: number;  // Index of correct option (0-based)
    }>;
  };
}

/**
 * AI_RESPONSE_GRADE - AI Service → Logic Service
 * ==============================================
 * Triggered: When AI Service finishes grading submission
 * Handler: gradeHandler.ts
 * 
 * Workflow:
 * 1. Assignment auto-grading enabled
 * 2. Student submits assignment
 * 3. Logic Service publishes to AI Service
 * 4. AI grades submission
 * 5. Publishes AI_RESPONSE_GRADE to Kafka
 * 6. Logic Service receives, saves grade to DB
 * 7. Notifies student with score and feedback
 * 
 * Example Message:
 * {
 *   "source": "ai-service",
 *   "data": {
 *     "gradeId": "grade-ai-001",
 *     "submissionId": "sub-001",
 *     "score": 85,
 *     "feedback": "Good solution, but consider edge cases",
 *     "gradedAt": "2024-01-25T15:35:00Z"
 *   }
 * }
 */
export interface AIResponseGradePayload extends KafkaBasePayload {
  data: {
    gradeId: string;          // Unique grade ID
    submissionId: string;     // Which submission graded
    score: number;            // Numeric score (0-100 or 0-maxScore)
    feedback: string;         // Detailed feedback for student
    gradedAt: string;         // ISO 8601 timestamp
  };
}

/**
 * WEB_QUIZ_SUBMITTED - Web Service → Logic Service
 * ===============================================
 * Triggered: When student submits quiz via web portal
 * Handler: quizHandler.ts
 * 
 * Workflow:
 * 1. Student takes quiz on web app
 * 2. Student clicks "Submit"
 * 3. Web Service publishes WEB_QUIZ_SUBMITTED
 * 4. Logic Service receives
 * 5. Auto-grades (count correct answers)
 * 6. Saves grade to database
 * 7. Notifies student of result
 * 
 * Example Message:
 * {
 *   "source": "web-service",
 *   "data": {
 *     "submissionId": "submit-001",
 *     "studentId": "user-123",
 *     "quizId": "quiz-001",
 *     "courseId": "course-CS101",
 *     "answers": {
 *       "q1": 1,     // Question 1, selected option 1
 *       "q2": 0,
 *       "q3": 2
 *     },
 *     "submittedAt": "2024-01-25T15:45:00Z"
 *   }
 * }
 */
export interface WebQuizSubmittedPayload extends KafkaBasePayload {
  data: {
    submissionId: string;     // Unique submission ID
    studentId: string;        // Student who submitted
    quizId: string;           // Which quiz
    courseId: string;         // Course context
    answers: Record<string, any>;  // Student's answers {questionId: selection}
    submittedAt: string;      // ISO 8601 timestamp
  };
}

// ===== PRODUCED MESSAGES (Events Sent to Other Services) =====
// These messages are PUBLISHED by this service to other microservices

/**
 * AI_REQUEST_ANSWER_TICKET - Logic Service → AI Service
 * ====================================================
 * Triggered: When student asks Q&A question
 * Recipient: AI Service processes request asynchronously
 * Response: AI publishes AI_RESPONSE back to Logic Service
 * 
 * Example Message:
 * {
 *   "source": "logic-service",
 *   "data": {
 *     "ticketId": "ticket-001",
 *     "question": "How to implement binary search?",
 *     "courseContext": "CS101 covers algorithms, data structures..."
 *   }
 * }
 */
export interface AIRequestAnswerTicketPayload extends KafkaBasePayload {
  data: {
    ticketId: string;         // Question ID from TICKET_CREATED
    question: string;         // Full question text
    courseContext: string;    // Relevant course info (documents, assignments)
  };
}

/**
 * AI_REQUEST_SUMMARIZE_DOC - Logic Service → AI Service
 * ==================================================
 * Triggered: When document uploaded (FILE_UPLOADED received)
 * Recipient: AI Service generates summary
 * Response: AI publishes summary back to Logic Service
 */
export interface AIRequestSummarizeDocPayload extends KafkaBasePayload {
  data: {
    documentId: string;       // File ID from FILE_UPLOADED
    courseId: string;         // Course context
    content: string;          // File content (text extracted)
    language: string;         // 'vi' (Vietnamese) or 'en' (English)
  };
}

/**
 * NOTIFICATION_SEND_DM - Logic Service → Notification Service
 * ==========================================================
 * Used Throughout: Send notifications to students/teachers
 * 
 * Examples:
 * 1. Grade Posted: "Your assignment has been graded: 85/100"
 * 2. Deadline Reminder: "Assignment due in 24 hours"
 * 3. Q&A Answered: "Your question has been answered"
 * 4. Assignment Returned: "Feedback provided on your submission"
 * 
 * Flow:
 * 1. Logic Service event happens (grade saved, etc)
 * 2. Logic Service publishes NOTIFICATION_SEND_DM
 * 3. Notification Service receives
 * 4. Sends Discord DM or email to user
 */
export interface NotificationSendDMPayload extends KafkaBasePayload {
  data: {
    userId: string;           // Who to notify
    title: string;            // Short notification title
    content: string;          // Full message
    link?: string;            // Deep link to relevant page (optional)
  };
}

/**
 * PROCESS_SUBMISSION - Logic Service → Analytics Service
 * ==================================================
 * Triggered: When new submission created
 * Purpose: Analytics tracks submissions for reporting
 * 
 * Analytics uses to calculate:
 * - Total submissions per course
 * - Submission trends over time
 * - On-time vs late submissions
 * - Submission rate by student
 */
export interface ProcessSubmissionPayload extends KafkaBasePayload {
  data: {
    submissionId: string;     // Unique submission ID
    studentId: string;        // Student identifier
    assignmentId: string;     // Assignment identifier
    courseId: string;         // Course identifier
    processedAt: string;      // ISO 8601 timestamp
  };
}

/**
 * PROCESS_GRADE - Logic Service → Analytics Service
 * ===============================================
 * Triggered: When grade created or updated
 * Purpose: Analytics tracks grades for reporting
 * 
 * Analytics uses to calculate:
 * - Average grade per assignment
 * - Grade distribution (A%, B%, C%, etc)
 * - Grade trends for student
 * - Grade trends for course
 * - Performance comparisons
 */
export interface ProcessGradePayload extends KafkaBasePayload {
  data: {
    gradeId: string;          // Unique grade ID
    studentId: string;        // Student identifier
    assignmentId: string;     // Assignment identifier
    courseId: string;         // Course identifier
    score: number;            // Numeric score
    maxScore: number;         // Maximum possible score
    gradedAt: string;         // ISO 8601 timestamp
  };
}

/**
 * DISCORD_RESPONSE - Logic Service → Discord Service
 * =================================================
 * Triggered: In response to COMMAND_REQUESTED
 * Purpose: Send command results back to Discord bot
 * 
 * Example usages:
 * - Student ran /grades CS101
 * - Logic Service queries grades
 * - Publishes formatted results via DISCORD_RESPONSE
 * - Discord bot displays table of grades to student
 */
export interface DiscordResponsePayload extends KafkaBasePayload {
  data: {
    userId: string;           // User who ran command
    commandId: string;        // Which command (for tracking)
    status: 'success' | 'error'; // Command succeeded or failed
    message: string;          // Plain text response
    payload?: Record<string, any>;  // Additional data (optional)
  };
}

/**
 * Union Type for All Consumed Messages
 * ====================================
 * Useful for:
 * - Kafka handler routing (determine which handler to call)
 * - Type checking for incoming message payloads
 * - Message validation pipelines
 * 
 * Usage:
 * ```typescript
 * const handleMessage = (payload: ConsumedKafkaMessage) => {
 *   if ('submissionId' in payload.data) {
 *     // Handle SUBMISSION_CREATED
 *   } else if ('question' in payload.data) {
 *     // Handle TICKET_CREATED
 *   }
 * }
 * ```
 */
export type ConsumedKafkaMessage =
  | FileUploadedPayload
  | SubmissionCreatedPayload
  | CommandRequestedPayload
  | TicketCreatedPayload
  | AIResponseQuizPayload
  | AIResponseGradePayload
  | WebQuizSubmittedPayload;

/**
 * Union Type for All Produced Messages
 * ===================================
 * Useful for:
 * - Type-safe message publishing
 * - Validating payloads before sending to Kafka
 * - Message tracking across services
 * 
 * Usage:
 * ```typescript
 * const publishMessage = (payload: ProducedKafkaMessage) => {
 *   producer.send({
 *     topic: getTopicFromPayload(payload),
 *     messages: [{value: JSON.stringify(payload)}]
 *   });
 * }
 * ```
 */
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
 * Base API Response Format
 * ========================
 * 
 * Every REST API endpoint MUST return this format
 * Ensures consistent response structure across all endpoints
 * 
 * Benefits:
 * ✅ Frontend knows response structure (success, statusCode, data)
 * ✅ Error handling standardized (error.code, error.details)
 * ✅ Logging consistent (can log all responses same way)
 * ✅ API documentation clearer (single response format)
 * 
 * Example Success Response:
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "Course retrieved successfully",
 *   "data": {
 *     "id": "course-cs101",
 *     "code": "CS101",
 *     "name": "Introduction to Programming"
 *   }
 * }
 * 
 * Example Error Response:
 * {
 *   "success": false,
 *   "statusCode": 404,
 *   "message": "Course not found",
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "details": "No course with ID: course-cs999"
 *   }
 * }
 */
export interface APIResponse<T = any> {
  /**
   * Success flag
   * true: operation succeeded, check data
   * false: operation failed, check error
   */
  success: boolean;

  /**
   * HTTP Status Code matched to response
   * 200: OK
   * 400: Bad Request (validation failed)
   * 401: Unauthorized (invalid token)
   * 403: Forbidden (not allowed)
   * 404: Not Found (resource doesn't exist)
   * 409: Conflict (duplicate email, etc)
   * 500: Server Error
   */
  statusCode: number;

  /**
   * Human-readable message
   * For success: brief description of what happened
   * For error: description of what went wrong
   */
  message: string;

  /**
   * Response payload (only present on success)
   * Type T is generic - can be:
   * - CourseDTO (single course)
   * - CourseDTO[] (list of courses)
   * - {count: 5} (summary response)
   * - null (delete operations)
   */
  data?: T;

  /**
   * Error details (only present on failure)
   * code: machine-readable error code (for frontend parsing)
   * details: additional explanation
   */
  error?: {
    code: string;
    details?: string;
  };
}

/**
 * Pagination Wrapper for Large Result Sets
 * =======================================
 * 
 * Used for: endpoints returning many items
 * - GET /courses (get all courses)
 * - GET /submissions (get all submissions)
 * - GET /grades (get all grades)
 * 
 * Example Response:
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "Courses retrieved",
 *   "data": [...10 courses...],
 *   "meta": {
 *     "total": 45,
 *     "page": 2,
 *     "pageSize": 10,
 *     "totalPages": 5
 *   }
 * }
 * 
 * Frontend Usage:
 * - total: show "45 total results"
 * - page: current page number
 * - pageSize: items per page
 * - totalPages: calculate page numbers for pagination UI
 */
export interface PaginatedAPIResponse<T = any> extends APIResponse<T> {
  /**
   * Pagination metadata
   * Helps frontend render pagination controls
   */
  meta?: {
    /** Total number of items (all pages) */
    total: number;

    /** Current page number (1-based) */
    page: number;

    /** Items returned per page */
    pageSize: number;

    /** Total number of pages */
    totalPages: number;
  };
}

/**
 * Health Check Response
 * ====================
 * 
 * Endpoint: GET /health
 * Purpose: Kubernetes readiness/liveness probe
 * Used by: Container orchestration to know if service is healthy
 * 
 * Response Example:
 * {
 *   "status": "ok",
 *   "timestamp": "2024-01-25T15:30:00Z",
 *   "uptime": 86400000,
 *   "services": {
 *     "database": "connected",
 *     "redis": "connected",
 *     "kafka": "connected"
 *   }
 * }
 * 
 * Kubernetes Usage:
 * - status === "ok" AND all services "connected": container is healthy
 * - Else: Kubernetes will restart container or remove from load balancer
 */
export interface HealthCheckResponse {
  /**
   * Overall service status
   * - 'ok': all critical services connected
   * - 'error': one or more services disconnected
   */
  status: 'ok' | 'error';

  /**
   * When health check ran (ISO 8601)
   * Example: "2024-01-25T15:30:00Z"
   */
  timestamp: string;

  /**
   * Service uptime in milliseconds
   * Calculated: Date.now() - startTime
   * Example: 86400000 = 24 hours
   */
  uptime: number;

  /**
   * Individual service connection status
   * Shows which dependencies are working
   */
  services: {
    /** Database connection (Prisma to PostgreSQL) */
    database: 'connected' | 'disconnected';

    /** Cache connection (Redis client) */
    redis: 'connected' | 'disconnected';

    /** Message broker connection (KafkaJS client) */
    kafka: 'connected' | 'disconnected';
  };
}

/**
 * User Data Transfer Object
 * ========================
 * 
 * Used in API responses when returning user information
 * Excludes sensitive fields: password hash, refresh tokens, etc
 * 
 * Example User:
 * {
 *   "id": "user-456",
 *   "email": "john@example.com",
 *   "role": "student",
 *   "name": "John Doe",
 *   "createdAt": "2023-09-01T08:00:00Z",
 *   "updatedAt": "2024-01-20T14:30:00Z"
 * }
 */
export interface UserDTO {
  /** Unique user identifier (UUID or ID) */
  id: string;

  /** Email address */
  email: string;

  /**
   * User role/permission level
   * - 'student': can submit, take quizzes, view grades
   * - 'teacher': can create assignments, grade, manage courses
   * - 'admin': full system access
   */
  role: 'student' | 'teacher' | 'admin';

  /** Full name of user */
  name: string;

  /** When account created (ISO 8601) */
  createdAt: string;

  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
}

/**
 * Course Data Transfer Object
 * ==========================
 * 
 * Used in GET /courses responses
 * Contains course metadata but not enrollment details
 * 
 * Example Course:
 * {
 *   "id": "course-cs101",
 *   "code": "CS101",
 *   "name": "Introduction to Programming",
 *   "instructorId": "user-123",
 *   "description": "Learn basic programming concepts",
 *   "enrollmentCount": 150,
 *   "createdAt": "2023-09-01T00:00:00Z",
 *   "updatedAt": "2024-01-20T10:00:00Z"
 * }
 */
export interface CourseDTO {
  /** Unique course identifier */
  id: string;

  /** Course code (e.g., CS101, MATH201) */
  code: string;

  /** Course full name */
  name: string;

  /** Teacher/instructor user ID */
  instructorId: string;

  /** Course description/syllabus (optional) */
  description?: string;

  /** Number of students enrolled (denormalized from enrollments table) */
  enrollmentCount: number;

  /** When course created */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Grade Data Transfer Object
 * =========================
 * 
 * Used in GET /grades responses
 * Contains score, feedback, and relevant IDs
 * 
 * Example Grade:
 * {
 *   "id": "grade-789",
 *   "studentId": "user-456",
 *   "assignmentId": "assign-001",
 *   "score": 85,
 *   "maxScore": 100,
 *   "feedback": "Good implementation, but edge cases missed",
 *   "gradedAt": "2024-01-25T15:30:00Z",
 *   "createdAt": "2024-01-25T15:30:00Z",
 *   "updatedAt": "2024-01-25T15:30:00Z"
 * }
 */
export interface GradeDTO {
  /** Unique grade identifier */
  id: string;

  /** Student user ID */
  studentId: string;

  /** Assignment ID being graded for */
  assignmentId: string;

  /** Score received (e.g., 85) */
  score: number;

  /** Maximum possible score (e.g., 100) */
  maxScore: number;

  /** Detailed feedback from grader */
  feedback?: string;

  /** When grade was assigned (ISO 8601) */
  gradedAt: string;

  /** When grade record created */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

// ============================================
// SERVICE TYPES
// ============================================

/**
 * AI Context Data
 * ===============
 * 
 * Fetched by: contextService.getStudentCourseContext()
 * Sent to: AI Service (via AI_REQUEST_ANSWER_TICKET payload)
 * Purpose: Provide AI with course context for better answers
 * 
 * When Used:
 * 1. Student asks Q&A question
 * 2. Logic Service fetches this context for the course
 * 3. Sends with question to AI Service
 * 4. AI uses documents + assignments to answer
 * 
 * Example Structure:
 * {
 *   "courseId": "course-cs101",
 *   "course": {
 *     "name": "Introduction to Programming",
 *     "code": "CS101",
 *     "description": "Learn Python programming..."
 *   },
 *   "documents": [
 *     {"id": "doc1", "title": "Chapter 1: Variables", "summary": "..."},
 *     {"id": "doc2", "title": "Chapter 2: Functions", "summary": "..."}
 *   ],
 *   "assignments": [
 *     {"id": "a1", "title": "Make calculator", "deadline": "2024-02-01"}
 *   ],
 *   "students": [
 *     {"id": "u1", "name": "Alice", "email": "alice@..."}
 *   ]
 * }
 */
export interface AIContextData {
  /** Course identifier */
  courseId: string;

  /** Course information */
  course: {
    /** Course name */
    name: string;

    /** Course code (CS101, MATH201, etc) */
    code: string;

    /** Course description/overview (optional) */
    description?: string;
  };

  /** Learning materials for the course */
  documents: Array<{
    id: string;
    title: string;
    summary: string;    // AI-generated summary of document
    fileUrl: string;    // URL to download full document
  }>;

  /** Assignments for context */
  assignments: Array<{
    id: string;
    title: string;
    deadline: string;   // ISO 8601 deadline
    rubricUrl?: string; // Grading rubric (optional)
  }>;

  /** List of students in course (for mention context) */
  students: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

/**
 * Google Sheets Sync Configuration
 * ==============================
 * 
 * Used by: sheetsService
 * Purpose: Sync course data with Google Sheets
 * 
 * Example Setup:
 * - Create Google Sheet with student grade data
 * - Logic Service reads/writes grades to Google Sheets
 * - Teachers can track or backup grades in Google Sheets
 * 
 * Configuration:
 * {
 *   "sheetId": "1A2b3C4d5E6f7G8h9I0j",
 *   "worksheetName": "CS101 Grades",
 *   "headers": ["StudentID", "Name", "Assignment1", "Assignment2"],
 *   "range": "A1:D100"
 * }
 */
export interface SheetsSyncConfig {
  /** Google Sheet ID (from URL) */
  sheetId: string;

  /** Worksheet name within the sheet */
  worksheetName: string;

  /** Column headers in order */
  headers: string[];

  /** Data range (A1 notation, e.g., A1:Z100) */
  range: string;
}

// ============================================
// CACHE KEY TYPES
// ============================================

/**
 * Type-Safe Redis Cache Keys
 * ===========================
 * 
 * Purpose: Prevent typos in Redis key strings
 * Ensures consistency across codebase
 * 
 * Redis Caching Strategy:
 * - Context data: 24 hour TTL (high volume, slow to compute)
 * - Course stats: 24 hour TTL (aggregation expensive)
 * - Student data: 1 hour TTL (may change frequently)
 * 
 * Example Usage:
 * ```typescript
 * const key: CacheKey = `context:course:${courseId}`;
 * const cached = await redis.get(key);
 * if (!cached) {
 *   const fresh = await computeContext(courseId);
 *   await redis.setex(key, 86400, JSON.stringify(fresh)); // 24hr
 * }
 * ```
 */
export type CacheKey =
  | `context:course:${string}`       // Student course context (AI reasoning)
  | `course:${string}`               // Course details
  | `user:${string}`                 // User profile
  | `quiz:${string}`                 // Quiz questions and metadata
  | `submissions:course:${string}`   // All submissions in course (for stats)
  | `grades:student:${string}`;      // All grades for a student

// ============================================
// AUTHENTICATION TYPES
// ============================================

/**
 * Service-to-Service Token Payload
 * ==============================
 * 
 * Used for: Inter-service authentication
 * Transport: X-Service-Token request header
 * Method: HMAC-SHA256 signature
 * TTL: 5 minutes
 * 
 * Token Flow:
 * 1. Service A constructs payload (service name, timestamp)
 * 2. Service A signs with HMAC using shared secret
 * 3. Service A sends in X-Service-Token header
 * 4. Service B receives, verifies signature
 * 5. Service B checks timestamp (not older than 5min)
 * 6. Service B proceeds with request if valid
 * 
 * Example Token:
 * service:1704067200000:abc123def456ghi789
 * (After decoding and verification)
 * {
 *   "service": "ai-service",
 *   "userId": "user-123",
 *   "timestamp": 1704067200000,
 *   "signature": "abc123def456ghi789"
 * }
 */
export interface ServiceTokenPayload {
  /** Name of service making request */
  service: string;

  /** Optional user ID (for tracking who initiated) */
  userId?: string;

  /** When token was created (milliseconds) */
  timestamp: number;

  /** HMAC-SHA256 signature for verification */
  signature: string;
}

/**
 * Authenticated Request Context
 * =============================
 * 
 * Attached to Express request object by auth middleware
 * Available in all protected route handlers
 * 
 * Usage in routes:
 * ```typescript
 * app.post('/grades', (req: ExpressRequest, res) => {
 *   const auth = req.auth as AuthenticatedRequest;
 *   
 *   // Can trust this service made the request
 *   if (auth.service === 'ai-service') {
 *     // Allow AI service to create grades
 *   }
 * });
 * ```
 */
export interface AuthenticatedRequest {
  /** Service name that authenticated (from token) */
  service: string;

  /** User ID if provided in token (optional) */
  userId?: string;

  /**
   * Request type indicator
   * - true: from another microservice (internal)
   * - false: from public client (should require user auth)
   */
  isInternal: boolean;
}

// ============================================
// ERROR TYPES
// ============================================

/**
 * Base Custom Error Class
 * =======================
 * 
 * Benefits:
 * ✅ Consistent error format across all errors
 * ✅ Type-safe error handling in routes
 * ✅ Easy to log with context
 * ✅ Frontend can parse error.code programmatically
 * 
 * Example Usage:
 * ```typescript
 * try {
 *   const course = await db.course.findUnique({...});
 *   if (!course) {
 *     throw new NotFoundError('Course');
 *   }
 * } catch (error) {
 *   if (error instanceof LogicServiceError) {
 *     res.status(error.statusCode).json({
 *       success: false,
 *       error: {code: error.code, details: error.details}
 *     });
 *   }
 * }
 * ```
 */
export class LogicServiceError extends Error {
  constructor(
    /** Machine-readable error code (e.g., VALIDATION_ERROR, NOT_FOUND) */
    public code: string,

    /** Human-readable error message */
    message: string,

    /** HTTP status code to return */
    public statusCode: number = 500,

    /** Additional details for debugging */
    public details?: string
  ) {
    super(message);
    this.name = 'LogicServiceError';
  }
}

/**
 * Validation Error (400 Bad Request)
 * =================================
 * 
 * Used when: Request data doesn't pass validation
 * Examples:
 * - Email format invalid
 * - Required field missing
 * - Score out of range
 * - Course code already exists
 * 
 * Example:
 * ```typescript
 * throw new ValidationError('Invalid email format', 'user@domain format required');
 * ```
 */
export class ValidationError extends LogicServiceError {
  constructor(message: string, details?: string) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error (404 Not Found)
 * ==============================
 * 
 * Used when: Resource doesn't exist
 * Examples:
 * - Course with ID not found
 * - Student doesn't exist
 * - Submission deleted
 * 
 * Example:
 * ```typescript
 * if (!course) {
 *   throw new NotFoundError('Course');
 * }
 * // Response: "Course không tìm thấy" (404)
 * ```
 */
export class NotFoundError extends LogicServiceError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} không tìm thấy`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized Error (401 Unauthorized)
 * ======================================
 * 
 * Used when: Authentication failed or not provided
 * Examples:
 * - Invalid service token signature
 * - Token expired (>5 minutes old)
 * - No token provided
 * 
 * Example:
 * ```typescript
 * if (!validSignature) {
 *   throw new UnauthorizedError('Invalid service token');
 * }
 * // Response: 401 Unauthorized
 * ```
 */
export class UnauthorizedError extends LogicServiceError {
  constructor(message: string = 'Không được phép truy cập') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}
