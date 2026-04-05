/**
 * Global Constants & Configuration
 * ================================
 * 
 * File Purpose:
 * - Kafka topic definitions (consumed & produced)
 * - Kafka consumer group configuration
 * - Redis cache TTL (Time-To-Live) settings
 * - Handler routing (topic → handler mapping)
 * - Constants shared across all service handlers
 * 
 * Mục đích:
 * - Định nghĩa Kafka topics (tiêu thụ và sản xuất)
 * - Cấu hình Kafka consumer group
 * - Cấu hình TTL cache Redis
 * - Định tuyến handler (topic → handler)
 * - Hằng số được sử dụng toàn bộ service
 * 
 * Benefits:
 * ✅ Single source of truth for topic names (prevent typos)
 * ✅ Easy to modify topic names across entire codebase
 * ✅ Clear dependencies (which handler handles which topic)
 * ✅ Cache configuration in one place
 * ✅ Consumer group configuration centralized
 * 
 * Usage Pattern:
 * ```typescript
 * // In handlers
 * import { KAFKA_TOPICS_CONSUME, KAFKA_CONSUMER_GROUP } from '../config/constants';
 * 
 * // In routes
 * import { REDIS_CACHE } from '../config/constants';
 * const cacheKey = `${REDIS_CACHE.COURSE_STATS.pattern}:${courseId}`;
 * ```
 */

// ============================================
// KAFKA TOPICS (Message Types/Names)
// ============================================

/**
 * Kafka Topics Consumed (Events Received from Other Services)
 * ===========================================================
 * 
 * These are messages that Logic Service RECEIVES from other microservices
 * Format: lms.{source-service}.{entity}.{action}
 * 
 * Topic Naming Convention:
 * - Prefix: lms (LMS - Learning Management System)
 * - Source: discord, ai, web (which service publishes)
 * - Entity: file, submission, command, ticket, quiz, grade
 * - Action: uploaded, created, requested, submitted, response
 * 
 * Flow Examples:
 * 1. FILE_UPLOADED: Discord Bot user uploads PDF → Logic Service saves to DB
 * 2. SUBMISSION_CREATED: Discord user submits assignment → Logic Service processes
 * 3. AI_RESPONSE_GRADE: AI finishes grading → Logic Service saves score to DB
 * 4. WEB_QUIZ_SUBMITTED: Web app user submits quiz → Logic Service auto-grades
 * 
 * Мүлік дөңгелеу (Topic Subscriptions):
 * Logic Service subscribes to ALL these topics in kafka/consumer.ts
 * When message arrives, consumer.ts routes to appropriate handler
 */
export const KAFKA_TOPICS_CONSUME = {
  /**
   * Topic: lms.discord.file.uploaded
   * Source: Discord Service
   * Trigger: Teacher uploads document/lesson material via Discord
   * Handler: documentHandler.ts
   * Action: Save file metadata to DB, optionally send to AI for summarization
   * 
   * Message Example:
   * {
   *   "messageId": "file-001-1234",
   *   "source": "discord-service",
   *   "timestamp": 1704067200000,
   *   "data": {
   *     "fileId": "file-123",
   *     "fileName": "lecture-notes.pdf",
   *     "fileSize": 2048576,
   *     "courseId": "course-cs101",
   *     "uploadedBy": "teacher-456"
   *   }
   * }
   */
  FILE_UPLOADED: 'lms.discord.file.uploaded',

  /**
   * Topic: lms.discord.submission.created
   * Source: Discord Service
   * Trigger: Student submits assignment via Discord (/submit command or button)
   * Handler: submissionHandler.ts
   * Action: Save submission to DB, update status, notify student/teacher
   * 
   * Message Example:
   * {
   *   "messageId": "sub-001-1234",
   *   "source": "discord-service",
   *   "data": {
   *     "submissionId": "sub-123",
   *     "studentId": "user-789",
   *     "assignmentId": "assign-001",
   *     "content": "My answer here...",
   *     "submittedAt": "2024-01-25T15:30:00Z"
   *   }
   * }
   */
  SUBMISSION_CREATED: 'lms.discord.submission.created',

  /**
   * Topic: lms.discord.command.requested
   * Source: Discord Service
   * Trigger: Student uses slash command in Discord
   * Supported Commands:
   *   - /grades [course] → List student's grades
   *   - /my_assignments → Show pending assignments
   *   - /class_stats → Show course statistics
   * Handler: commandHandler.ts
   * Action: Query database, format response, publish DISCORD_RESPONSE
   * 
   * Message Example:
   * {
   *   "messageId": "cmd-001-1234",
   *   "source": "discord-service",
   *   "data": {
   *     "commandId": "cmd-001",
   *     "commandName": "grades",
   *     "userId": "user-456",
   *     "courseId": "course-cs101",
   *     "args": {"limit": 10}
   *   }
   * }
   */
  COMMAND_REQUESTED: 'lms.discord.command.requested',

  /**
   * Topic: lms.discord.ticket.created
   * Source: Discord Service
   * Trigger: Student asks Q&A question in Discord channel
   * Handler: contextHandler.ts
   * Action: Save question to DB, fetch course context, publish to AI Service
   * 
   * Message Example:
   * {
   *   "messageId": "ticket-001-1234",
   *   "source": "discord-service",
   *   "data": {
   *     "ticketId": "ticket-001",
   *     "studentId": "user-789",
   *     "courseId": "course-cs101",
   *     "title": "How to implement binary search?",
   *     "question": "Can someone explain the algorithm step by step?"
   *   }
   * }
   */
  TICKET_CREATED: 'lms.discord.ticket.created',

  /**
   * Topic: lms.ai.response.quiz
   * Source: AI Service
   * Trigger: AI Service finishes generating quiz questions
   * Process: Teacher requests "Create quiz for chapter 5"
   * Handler: aiQuizHandler.ts
   * Action: Save quiz as DRAFT, notify teacher for review
   * 
   * Message Example:
   * {
   *   "messageId": "quiz-ai-001-1234",
   *   "source": "ai-service",
   *   "data": {
   *     "quizId": "quiz-ai-001",
   *     "courseId": "course-cs101",
   *     "questions": [
   *       {"content": "What is O(n)?", "options": [...], "correctAnswer": 1}
   *     ]
   *   }
   * }
   */
  AI_RESPONSE_QUIZ: 'lms.ai.response.quiz',

  /**
   * Topic: lms.ai.response.grade
   * Source: AI Service
   * Trigger: AI Service finishes auto-grading submissions
   * Process: Assignment has auto-grade enabled, AI grades student's code
   * Handler: gradeHandler.ts
   * Action: Save grade to DB, notify student of score + feedback
   * 
   * Message Example:
   * {
   *   "messageId": "grade-ai-001-1234",
   *   "source": "ai-service",
   *   "data": {
   *     "gradeId": "grade-ai-001",
   *     "submissionId": "sub-123",
   *     "score": 85,
   *     "feedback": "Good solution, but consider edge cases"
   *   }
   * }
   */
  AI_RESPONSE_GRADE: 'lms.ai.response.grade',

  /**
   * Topic: lms.web.quiz.submitted
   * Source: Web Service
   * Trigger: Student submits quiz via web portal
   * Process: Student takes quiz on web app, clicks "Submit"
   * Handler: quizHandler.ts
   * Action: Auto-grade quiz, save grade to DB, notify student
   * 
   * Message Example:
   * {
   *   "messageId": "submit-001-1234",
   *   "source": "web-service",
   *   "data": {
   *     "submissionId": "submit-001",
   *     "studentId": "user-789",
   *     "quizId": "quiz-001",
   *     "answers": {"q1": 1, "q2": 0, "q3": 2},
   *     "submittedAt": "2024-01-25T15:45:00Z"
   *   }
   * }
   */
  WEB_QUIZ_SUBMITTED: 'lms.web.quiz.submitted',
} as const;

/**
 * Kafka Topics Produced (Events Sent to Other Services)
 * ===================================================
 * 
 * These are messages that Logic Service PUBLISHES to other microservices
 * Format: lms.{destination-service}.{action|request}
 * 
 * Publishing Flow:
 * - Logic Service publishes message to Kafka
 * - Topic indicates which service should handle it
 * - Destination service consumes and processes
 * - May publish response message back
 */
export const KAFKA_TOPICS_PRODUCE = {
  /**
   * Topic: lms.ai.request.answer_ticket
   * Destination: AI Service
   * Trigger: Student asked Q&A question (TICKET_CREATED received)
   * Content: Question + course context (documents, assignments)
   * Response: AI publishes AI_RESPONSE_QUIZ back
   * 
   * Use Case:
   * 1. Student: "What is binary search?"
   * 2. Logic Service→AI: Publish question + course materials
   * 3. AI Service: Processes, generates answer
   * 4. AI→Logic Service: Publish answer via AI_RESPONSE_QUIZ
   * 5. Logic Service: Saves answer, notifies student
   * 
   * Message format: see AIRequestAnswerTicketPayload in types/
   */
  AI_REQUEST_ANSWER_TICKET: 'lms.ai.request.answer_ticket',

  /**
   * Topic: lms.ai.request.summarize_doc
   * Destination: AI Service
   * Trigger: File uploaded (FILE_UPLOADED received)
   * Content: Document content, language, course context
   * Response: AI publishes summary back
   * 
   * Use Case:
   * 1. Teacher uploads PDF lecture notes
   * 2. Logic Service→AI: Publish document + course context
   * 3. AI Service: Summarizes the document
   * 4. AI→Logic Service: Publish summary
   * 5. Logic Service: Saves summary to database
   * 
   * Benefits:
   * - Teachers can browse auto-generated summaries
   * - Students get quick overview of materials
   * - Time savings (manual summarization eliminated)
   * 
   * Message format: see AIRequestSummarizeDocPayload in types/
   */
  AI_REQUEST_SUMMARIZE_DOC: 'lms.ai.request.summarize_doc',

  /**
   * Topic: lms.notification.send.dm
   * Destination: Notification Service
   * Trigger: Various events (grade posted, deadline, Q&A answered)
   * Content: User ID, title, message, optional deep link
   * 
   * Use Cases:
   * - Grade notification: "Your assignment scored 85/100"
   * - Deadline reminder: "Assignment due in 24 hours"
   * - Q&A notification: "Your question was answered"
   * - Submission feedback: "Feedback added to your submission"
   * 
   * Response: Notification Service sends Discord DM or email
   * 
   * Message format: see NotificationSendDMPayload in types/
   */
  NOTIFICATION_SEND_DM: 'lms.notification.send.dm',

  /**
   * Topic: lms.logic.process.submission
   * Destination: Analytics Service
   * Trigger: Student submits assignment (SUBMISSION_CREATED received)
   * Content: Submission ID, student ID, course context, timestamp
   * Purpose: Analytics Service tracks submission statistics
   * 
   * Analytics Uses This To Calculate:
   * - Total submissions per course over time
   * - Submission rate (how many students submitted)
   * - On-time vs late submission percentage
   * - Submission trends (which days have high volume)
   * - Per-student submission history
   * 
   * No response expected (fire-and-forget event)
   * 
   * Message format: see ProcessSubmissionPayload in types/
   */
  PROCESS_SUBMISSION: 'lms.logic.process.submission',

  /**
   * Topic: lms.logic.process.grade
   * Destination: Analytics Service
   * Trigger: Grade created or updated (in grades route)
   * Content: Grade ID, score, maxScore, student/assignment/course IDs
   * Purpose: Analytics Service tracks grade statistics
   * 
   * Analytics Uses This To Calculate:
   * - Average grade per assignment
   * - Grade distribution (A%, B%, C%...)
   * - Per-student grade trends
   * - Per-course grade trends
   * - Grade comparison between cohorts
   * - Outlier detection (students significantly above/below average)
   * 
   * No response expected (fire-and-forget event)
   * 
   * Message format: see ProcessGradePayload in types/
   */
  PROCESS_GRADE: 'lms.logic.process.grade',

  /**
   * Topic: lms.discord.response
   * Destination: Discord Service
   * Trigger: In response to COMMAND_REQUESTED
   * Content: Command result, response status, formatted message
   * 
   * Workflow:
   * 1. Student types /grades CS101 in Discord
   * 2. Discord→Logic Service: Publish COMMAND_REQUESTED
   * 3. Logic Service: Query database, generate response
   * 4. Logic Service→Discord: Publish DISCORD_RESPONSE
   * 5. Discord Bot: Parse response, show formatted table to student
   * 
   * Example Response:
   * {
   *   "userId": "user-456",
   *   "commandId": "cmd-001",
   *   "status": "success",
   *   "message": "Showing 5 grades...",
   *   "payload": {
   *     "grades": [
   *       {"assignment": "HW1", "score": "9/10"},
   *       {"assignment": "HW2", "score": "8/10"}
   *     ]
   *   }
   * }
   * 
   * Message format: see DiscordResponsePayload in types/
   */
  DISCORD_RESPONSE: 'lms.discord.response',
} as const;

/**
 * All Kafka Topics Combined
 * ========================
 * 
 * Union of both consumed and produced topics
 * Useful for:
 * - Logging (validate topic name when publishing)
 * - Monitoring (check if topic is known)
 * - Type validation in message handlers
 * 
 * Usage:
 * ```typescript
 * if (topic in KAFKA_TOPICS) {
 *   console.log(`Valid topic: ${topic}`);
 * } else {
 *   throw new Error(`Unknown topic: ${topic}`);
 * }
 * ```
 */
export const KAFKA_TOPICS = {
  ...KAFKA_TOPICS_CONSUME,
  ...KAFKA_TOPICS_PRODUCE,
} as const;

// ============================================
// KAFKA CONSUMER CONFIGURATION
// ============================================

/**
 * Kafka Consumer Group ID
 * =======================
 * 
 * Consumer Group: "logic-service-group"
 * 
 * Purpose:
 * - All instances of Logic Service share same group ID
 * - Kafka automatically load-balances messages across instances
 * - Each partition assigned to one consumer in the group
 * 
 * Example Scaling Scenario:
 * - Initially: 1 Logic Service instance running
 *   - Consumer 1 processes all messages from all partitions
 * - Scale up to 3 instances:
 *   - Kafka rebalances automatically
 *   - Consumer 1 handles partition 0
 *   - Consumer 2 handles partition 1
 *   - Consumer 3 handles partition 2
 *   - Load distributed equally
 * - Scale down to 1 instance:
 *   - Consumer 1 again handles all partitions
 *   - Rebalancing automatic
 * 
 * Benefits:
 * ✅ Horizontal scalability (add/remove instances)
 * ✅ Automatic load balancing
 * ✅ No duplicate processing (each partition to one consumer)
 * ✅ Fault tolerance (if one instance dies, others take over)
 * 
 * Used in: kafka/consumer.ts (new Consumer({groupId: KAFKA_CONSUMER_GROUP}))
 */
export const KAFKA_CONSUMER_GROUP = 'logic-service-group' as const;

/**
 * Topics to Subscribe To
 * ======================
 * 
 * Automatically derive list of topics from KAFKA_TOPICS_CONSUME
 * Consumer subscribes to all these topics at startup
 * 
 * Equivalent to:
 * ```typescript
 * [
 *   'lms.discord.file.uploaded',
 *   'lms.discord.submission.created',
 *   'lms.discord.command.requested',
 *   'lms.discord.ticket.created',
 *   'lms.ai.response.quiz',
 *   'lms.ai.response.grade',
 *   'lms.web.quiz.submitted'
 * ]
 * ```
 * 
 * Dynamic subscription ensures:
 * - Only one place to maintain topic list (KAFKA_TOPICS_CONSUME)
 * - Adding new topic: add to KAFKA_TOPICS_CONSUME, already subscribed
 * - No typos (using const, not string literal)
 * 
 * Used in: kafka/consumer.ts (consumer.subscribe({topics: KAFKA_TOPICS_SUBSCRIBE}))
 */
export const KAFKA_TOPICS_SUBSCRIBE = Object.values(KAFKA_TOPICS_CONSUME);

// ============================================
// REDIS CACHE CONFIGURATION (TTL - Time To Live)
// ============================================

/**
 * Redis Cache Configuration
 * =========================
 * 
 * Purpose:
 * - Define cache patterns and their time-to-live (TTL)
 * - TTL: How long data stays in cache before expiring
 * - Measured in seconds
 * 
 * Caching Strategy Explanation:
 * - Short TTL (2-5 min): Frequently changing data (stats, assignments)
 * - Medium TTL (10-30 min): Moderate change rate (user profiles, courses)
 * - Long TTL (1+ hours): Stable data (Q&A answers, course context)
 * 
 * Performance Impact:
 * - Redis is ~50x faster than database for same query
 * - Example: course stats
 *   - Database query: ~100ms
 *   - Redis hit: ~2ms
 *   - Saving: 98ms per request
 *   - With 100 requests/sec: 9.8 seconds saved per second!
 * 
 * Cache Invalidation:
 * - Automatic: Wait for TTL to expire
 * - Manual: Delete key when data changes
 *   Example: When grade saved, delete stats cache so recalculated on next query
 * 
 * Used in:
 * - routes/courses.ts (course stats caching)
 * - services/contextService.ts (AI context caching)
 * - handlers/* (user/course lookup caching)
 * 
 * Key Naming Convention: {pattern}:{id}
 * Example: course:stats:course-cs101
 */
export const REDIS_CACHE = {
  /**
   * COURSE_SERVER - Discord Server to Course Mapping
   * 
   * Pattern: "course:server:{discordServerId}"
   * TTL: 5 minutes (300 seconds)
   * 
   * Purpose:
   * - Map Discord server ID → Logic Service course ID
   * - Used when message received from Discord with serverId
   * 
   * When Used:
   * - documentHandler: "File uploaded in which course?"
   * - submissionHandler: "Student submitted in which course?"
   * - All Discord-originating messages need course context
   * 
   * Cache Miss → Database Query:
   * SELECT id FROM Course WHERE discordServerId = ? LIMIT 1
   * 
   * Example:
   * Key: "course:server:discord-123"
   * Value: "course-cs101"
   * 
   * Why 5 minutes?
   * - Teacher rarely changes Discord server mapping
   * - If changed, 5min delay acceptable
   * - Reduces database load significantly
   */
  COURSE_SERVER: {
    pattern: 'course:server:{discordServerId}',
    ttl: 5 * 60, // 300 seconds = 5 minutes
  },

  /**
   * USER_DISCORD - Discord ID to User Mapping
   * 
   * Pattern: "user:discord:{discordId}"
   * TTL: 10 minutes (600 seconds)
   * 
   * Purpose:
   * - Map Discord user ID → Logic Service user ID
   * - All Discord messages contain discordId, need to find actual user
   * 
   * When Used:
   * - All message handlers (need to know which user in system)
   * - submissionHandler: "Which student submitted?"
   * - commandHandler: "Which user ran the command?"
   * 
   * Cache Miss → Database Query:
   * SELECT id FROM User WHERE discordId = ? LIMIT 1
   * 
   * Example:
   * Key: "user:discord:discord-456"
   * Value: "user-789"
   * 
   * Why 10 minutes?
   * - User Discord ID rarely changes
   * - Moderate change rate compared to course mapping
   * - High lookup frequency justifies longer TTL
   */
  USER_DISCORD: {
    pattern: 'user:discord:{discordId}',
    ttl: 10 * 60, // 600 seconds = 10 minutes
  },

  /**
   * QA_ANSWER - Cached Q&A Answers
   * 
   * Pattern: "qa:cache:{questionHash}"
   * TTL: 1 hour (3600 seconds)
   * 
   * Purpose:
   * - Cache AI-generated answers to prevent duplicate processing
   * - Hash of question → AI answer
   * 
   * When Used:
   * - contextHandler: Before asking AI for answer
   * - If same question asked twice, use cached answer
   * 
   * Benefits:
   * - Avoid AI API costs for duplicate questions
   * - Instant response for frequently asked questions
   * - Better user experience
   * 
   * Example:
   * Key: "qa:cache:abc123def456"
   * Value: {answer: "Binary search works by...", timestamp: ...}
   * 
   * Question Hash:
   * - Not exact string match (typos would miss cache)
   * - Semantic hash or fuzzy matching
   * - Or just normalize question and hash
   * 
   * Why 1 hour?
   * - Q&A answers are pretty stable
   * - Can reuse answer for similar questions throughout day
   * - Longer TTL = more potential savings
   */
  QA_ANSWER: {
    pattern: 'qa:cache:{questionHash}',
    ttl: 60 * 60, // 3600 seconds = 1 hour
  },

  /**
   * COURSE_STATS - Course Statistics Cache
   * 
   * Pattern: "course:stats:{courseId}"
   * TTL: 2 minutes (120 seconds)
   * 
   * Purpose:
   * - Cache aggregated course statistics
   * - Total students, average grade, submission rate, etc
   * 
   * When Used:
   * - routes/courses.ts: GET /courses/:id/stats
   * - commandHandler: /class_stats command
   * - Dashboard requests
   * 
   * Statistics Calculated:
   * - Total enrolled students
   * - Average assignment score
   * - Submission completion rate
   * - Grade distribution (A%, B%, C%)
   * - Attendance rate
   * 
   * Database Query (expensive):
   * SELECT COUNT(DISTINCT student_id), AVG(score)
   * FROM grades WHERE assignment_id IN (
   *   SELECT id FROM assignment WHERE course_id = ?
   * ) GROUP BY course_id;
   * 
   * Cache provides:
   * - Instant response (2ms vs 500ms+)
   * - Reduces database load
   * 
   * Why 2 minutes?
   * - Stats change frequently (new grades, submissions)
   * - 2-minute acceptable staleness
   * - Balances accuracy vs performance
   * - When grade saved: manually delete this cache for fresh stats
   * 
   * Cache Invalidation:
   * When grade saved:
   * redis.del(`course:stats:${courseId}`);
   * // Next request will recalculate fresh stats
   */
  COURSE_STATS: {
    pattern: 'course:stats:{courseId}',
    ttl: 2 * 60, // 120 seconds = 2 minutes
  },

  /**
   * CONTEXT - AI Reasoning Context Cache
   * 
   * Pattern: "context:{studentId}:{courseId}"
   * TTL: 5 minutes (300 seconds)
   * 
   * Purpose:
   * - Cache student's course context (documents, assignments, etc)
   * - Used when fetching context for AI to answer questions
   * 
   * When Used:
   * - contextService.getStudentCourseContext()
   * - When student asks Q&A question
   * - Provides AI with course materials for context
   * 
   * Context Contents:
   * - Course info (name, code, description)
   * - Documents (lecture notes with summaries)
   * - Assignments (titles and deadlines)
   * - Student roster (names and emails)
   * 
   * Database Query (slow):
   * - Multiple joins to get documents, assignments, students
   * - Can take 200+ms for large course
   * 
   * Benefits of Caching:
   * - Instant response on cache hit (2ms)
   * - Student can ask multiple questions quickly
   * - AI gets consistent context
   * 
   * Why 5 minutes?
   * - Context documents rarely change mid-day
   * - Course structure stable during course
   * - 5min acceptable for accuracy
   * - High query volume (every Q&A uses this)
   * 
   * Example:
   * Key: "context:user-456:course-cs101"
   * Value: {
   *   courseId: "course-cs101",
   *   course: {name: "CS101", ...},
   *   documents: [...],
   *   assignments: [...],
   *   students: [...]
   * }
   */
  CONTEXT: {
    pattern: 'context:{studentId}:{courseId}',
    ttl: 5 * 60, // 300 seconds = 5 minutes
  },
} as const;

// ============================================
// HANDLER ROUTING (Topic → Handler Mapping)
// ============================================

/**
 * Kafka Topic to Handler Function Mapping
 * =======================================
 * 
 * Purpose:
 * - Map each Kafka topic to its corresponding handler function
 * - Used by kafka/consumer.ts to route incoming messages
 * - Single source of truth for topic-handler relationships
 * 
 * Message Processing Flow:
 * 1. Consumer receives message from topic
 * 2. Map topic to handler function name
 * 3. Dynamically import handler (see handlers/ folder)
 * 4. Call handler(payload)
 * 5. Handler processes the message
 * 
 * Implementation in kafka/consumer.ts:
 * ```typescript
 * const handlerName = KAFKA_HANDLER_MAP[topic];
 * const handler = await import(`../handlers/${handlerName}`);
 * await handler.default(message.value);
 * ```
 * 
 * Benefits:
 * ✅ Single mapping (no duplicates)
 * ✅ Type-safe (compile-time checking)
 * ✅ Easy to audit (see all topic→handler relationships)
 * ✅ Easy to modify (add/remove handlers in one place)
 * 
 * Adding New Handler:
 * 1. Create new handler file in handlers/
 * 2. Add entry to KAFKA_TOPICS_CONSUME
 * 3. Add entry to KAFKA_HANDLER_MAP
 * 4. Done! Consumer automatically routes messages
 */
export const KAFKA_HANDLER_MAP = {
  /**
   * lms.discord.file.uploaded → documentHandler
   * Process: Save file metadata, optionally summarize
   */
  [KAFKA_TOPICS_CONSUME.FILE_UPLOADED]: 'documentHandler',

  /**
   * lms.discord.submission.created → submissionHandler
   * Process: Save submission, update assignment status, notify teacher
   */
  [KAFKA_TOPICS_CONSUME.SUBMISSION_CREATED]: 'submissionHandler',

  /**
   * lms.discord.command.requested → commandHandler
   * Process: Execute command (/grades, /assignments, /stats)
   */
  [KAFKA_TOPICS_CONSUME.COMMAND_REQUESTED]: 'commandHandler',

  /**
   * lms.discord.ticket.created → contextHandler
   * Process: Save Q&A, fetch context, publish to AI Service
   */
  [KAFKA_TOPICS_CONSUME.TICKET_CREATED]: 'contextHandler',

  /**
   * lms.ai.response.quiz → aiQuizHandler
   * Process: Save AI-generated quiz as DRAFT, notify teacher for review
   */
  [KAFKA_TOPICS_CONSUME.AI_RESPONSE_QUIZ]: 'aiQuizHandler',

  /**
   * lms.ai.response.grade → gradeHandler
   * Process: Save grade from AI, update submission status, notify student
   */
  [KAFKA_TOPICS_CONSUME.AI_RESPONSE_GRADE]: 'gradeHandler',

  /**
   * lms.web.quiz.submitted → quizHandler
   * Process: Auto-grade quiz, save grade, notify student
   */
  [KAFKA_TOPICS_CONSUME.WEB_QUIZ_SUBMITTED]: 'quizHandler',
} as const;
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
