/**
 * Kafka Producer - Event Publisher
 * ================================
 * 
 * Mục đích:
 * - Publish events to other microservices via Kafka
 * - Request AI service to grade, answer, summarize
 * - Send notifications to users
 * - Broadcast analytics events
 * 
 * Architecture:
 * 
 * This Service (Logic Service)  →  Kafka Broker  →  Other Services
 *       │
 *       ├─ publishAIAnswerTicket()    → AI_REQUEST_ANSWER_TICKET → AI Service
 *       │
 *       ├─ publishAISummarizeDoc()    → AI_REQUEST_SUMMARIZE_DOC → AI Service
 *       │
 *       ├─ publishNotification()      → NOTIFICATION_SEND_DM → Notification Service
 *       │
 *       ├─ publishProcessSubmission() → PROCESS_SUBMISSION → Analytics Service
 *       │
 *       ├─ publishProcessGrade()      → PROCESS_GRADE → Analytics Service
 *       │
 *       └─ publishDiscordResponse()   → DISCORD_RESPONSE → Discord Service
 * 
 * Event Flow Examples:
 * 
 * 1. Grade Request:
 *    Student submits → DB save → publishProcessGrade() → Analytics gets event
 * 
 * 2. AI Grading:
 *    Grade received from AI → DB save → publishNotification() → User notified
 * 
 * 3. Q&A Answer:
 *    Student asks question → publishAIAnswerTicket() → AI generates response
 *    AI sends response back → publishNotification() → Student sees response
 * 
 * Producer Configuration:
 * - idempotent: true (prevents duplicate messages)
 * - allowAutoTopicCreation: true (creates topics if not exist)
 * - retry: exponential backoff on failure
 * - SASL/SSL: auth if credentials provided
 * 
 * Idempotency:
 * - Each message gets unique messageId
 * - Timestamp included for ordering
 * - Key set based on resource ID (studentId, gradeId, etc)
 * - If producer retries: broker detects duplicate, doesn't double-process
 * 
 * Error Handling:
 * - If send fails: exception thrown to caller
 * - Caller should handle with try/catch
 * - Don't throw = message lost (not ideal)
 * - Future: add retry queue or dead-letter topic
 * 
 * Singleton Pattern:
 * - Only one producer instance per process
 * - Reused across all requests
 * - Prevents resource leaks
 */

import { Kafka, Producer, logLevel } from 'kafkajs';
import { config } from '../config/env';
import { KAFKA_TOPICS_PRODUCE } from '../config/constants';
import {
  AIRequestAnswerTicketPayload,
  AIRequestSummarizeDocPayload,
  NotificationSendDMPayload,
  ProcessSubmissionPayload,
  ProcessGradePayload,
  DiscordResponsePayload,
  ProducedKafkaMessage,
} from '../types';

/**
 * Global Producer Instance
 * =======================
 * Singleton: only one producer per process
 * Null until first call needs it
 * Set to null after closeProducer() is called
 */
let producerInstance: Producer | null = null;

/**
 * Initialize Kafka Client
 * =======================
 * 
 * @returns Kafka client (not connected yet)
 * @private Internal use only
 */
const initKafkaClient = (): Kafka => {
  return new Kafka({
    brokers: config.kafkaBroker.includes(',')
      ? config.kafkaBroker.split(',')
      : [config.kafkaBroker],
    logLevel: config.nodeEnv === 'development' ? logLevel.DEBUG : logLevel.ERROR,
    retry: {
      initialRetryTime: 100,
      retries: 8,
      maxRetryTime: 30000,
    },
    ...(config.kafkaUsername && config.kafkaPassword && {
      sasl: {
        mechanism: 'plain',
        username: config.kafkaUsername,
        password: config.kafkaPassword,
      },
      ssl: true,
    }),
  });
};

/**
 * Get or Create Producer Singleton
 * ================================
 * 
 * First call: creates new producer, connects, returns it
 * Subsequent calls: returns same instance (cached)
 * 
 * Configuration:
 * - idempotent: true = prevent duplicate sends
 * - allowAutoTopicCreation: true = create topics if not exist
 * - retry: exponential backoff (100ms → 30s)
 * 
 * Events:
 * - producer.connect: logs success
 * - producer.disconnect: logs warning
 * - producer.network.request_timeout: auto-retry
 * 
 * @returns Producer instance (connected)
 * @throws Error if connection fails
 * @private Internal use only
 */
const getProducer = async (): Promise<Producer> => {
  // If already created, return cached instance
  if (producerInstance) {
    return producerInstance;
  }

  const kafka = initKafkaClient();
  producerInstance = kafka.producer({
    idempotent: true,                 // No duplicate messages
    allowAutoTopicCreation: true,     // Create topics automatically
    retry: {
      initialRetryTime: 100,
      retries: 8,
      maxRetryTime: 30000,
    },
  });

  // ===== Event Listeners =====
  producerInstance.on('producer.connect', () => {
    console.log('✅ Kafka Producer connected');
  });

  producerInstance.on('producer.disconnect', () => {
    console.warn('⚠️ Kafka Producer disconnected');
  });

  producerInstance.on('producer.network.request_timeout', () => {
    console.warn('⚠️ Kafka Producer network timeout');
  });

  await producerInstance.connect();
  return producerInstance;
};

/**
 * Publish: AI Request to Answer Q&A Ticket
 * ========================================
 * 
 * When called:
 * - Student asks question in Discord (Q&A channel)
 * - Backend saves question to DB
 * - Backend publishes event to AI service
 * - AI service receives, generates answer
 * - AI publishes response back (AI_RESPONSE_QUIZ topic)
 * - Backend receives and publishes notification to student
 * 
 * Message Payload:
 * {
 *   "source": "logic-service",
 *   "timestamp": 1234567890,
 *   "messageId": "unique-id",
 *   "data": {
 *     "ticketId": "ticket-001",
 *     "content": "How to use async/await?",
 *     "courseId": "course-001",
 *     "studentId": "student-123"
 *   }
 * }
 * 
 * Kafka Topic: AI_REQUEST_ANSWER_TICKET
 * Key: ticketId (for ordering, parallel processing)
 * 
 * @param payload - Request data (without timestamp/messageId)
 * @throws Error if message send fails
 * @exported Used in contextHandler.ts
 */
export const publishAIAnswerTicket = async (
  payload: Omit<AIRequestAnswerTicketPayload, 'timestamp' | 'messageId'>
): Promise<void> => {
  const producer = await getProducer();
  
  // Add system metadata (timestamp, messageId)
  const fullPayload: AIRequestAnswerTicketPayload = {
    ...payload,
    timestamp: Date.now(),
    messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  // Send to Kafka
  await producer.send({
    topic: KAFKA_TOPICS_PRODUCE.AI_REQUEST_ANSWER_TICKET,
    messages: [
      {
        key: fullPayload.data.ticketId,  // Use ticketId as key for ordering
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.AI_REQUEST_ANSWER_TICKET} (ticketId: ${fullPayload.data.ticketId})`
  );
};

/**
 * Publish: AI Request to Summarize Document
 * ========================================
 * 
 * When called:
 * - Student uploads PDF/document to Discord
 * - Backend saves to storage
 * - Backend publishes summarize request to AI
 * - AI service receives, generates summary
 * - AI publishes summary back (AI_RESPONSE_GRADE topic)
 * - Backend saves summary to DB + notifies student
 * 
 * Message Payload:
 * {
 *   "source": "logic-service",
 *   "timestamp": 1234567890,
 *   "messageId": "unique-id",
 *   "data": {
 *     "documentId": "doc-001",
 *     "courseId": "course-001",
 *     "fileUrl": "https://storage/doc-001.pdf",
 *     "fileName": "lecture-notes.pdf"
 *   }
 * }
 * 
 * Kafka Topic: AI_REQUEST_SUMMARIZE_DOC
 * Key: documentId (for ordering, parallel processing)
 * 
 * @param payload - Request data (without timestamp/messageId)
 * @throws Error if message send fails
 * @exported Used in documentHandler.ts
 */
export const publishAISummarizeDoc = async (
  payload: Omit<AIRequestSummarizeDocPayload, 'timestamp' | 'messageId'>
): Promise<void> => {
  const producer = await getProducer();
  
  const fullPayload: AIRequestSummarizeDocPayload = {
    ...payload,
    timestamp: Date.now(),
    messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  await producer.send({
    topic: KAFKA_TOPICS_PRODUCE.AI_REQUEST_SUMMARIZE_DOC,
    messages: [
      {
        key: fullPayload.data.documentId,  // Document ID as key
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.AI_REQUEST_SUMMARIZE_DOC} (docId: ${fullPayload.data.documentId})`
  );
};

/**
 * Publish: Send Notification/DM to User
 * ====================================
 * 
 * When called:
 * - Grade posted → notify student
 * - Assignment due soon → notify students
 * - Q&A answer ready → notify student
 * - Grade changed → notify student
 * 
 * Message Payload:
 * {
 *   "source": "logic-service",
 *   "timestamp": 1234567890,
 *   "messageId": "unique-id",
 *   "data": {
 *     "userId": "student-123",
 *     "title": "📝 Bài tập đã được chấm",
 *     "content": "Bài tập CS101 đã được chấm. Điểm: 85/100",
 *     "link": "/submissions/sub-001"
 *   }
 * }
 * 
 * Kafka Topic: NOTIFICATION_SEND_DM
 * Key: userId (for ordering per user)
 * Recipient: Notification Service (sends DM via Discord/email)
 * 
 * @param payload - Notification data (without timestamp/messageId)
 * @throws Error if message send fails
 * @exported Used in gradeHandler, submissionHandler, etc
 */
export const publishNotification = async (
  payload: Omit<NotificationSendDMPayload, 'timestamp' | 'messageId'>
): Promise<void> => {
  const producer = await getProducer();
  
  const fullPayload: NotificationSendDMPayload = {
    ...payload,
    timestamp: Date.now(),
    messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  await producer.send({
    topic: KAFKA_TOPICS_PRODUCE.NOTIFICATION_SEND_DM,
    messages: [
      {
        key: fullPayload.data.userId,  // User ID as key for per-user ordering
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.NOTIFICATION_SEND_DM} (userId: ${fullPayload.data.userId})`
  );
};

/**
 * Publish: Process Submission Event
 * ===============================
 * 
 * When called:
 * - Student submits assignment → publish event
 * - Backend notified Analytics Service
 * 
 * Used by: Analytics Service to track submission metrics
 * - Total submissions per course
 * - Submission rate by day
 * - On-time vs late submissions
 * 
 * Message Payload:
 * {
 *   "source": "logic-service",
 *   "timestamp": 1234567890,
 *   "messageId": "unique-id",
 *   "data": {
 *     "submissionId": "sub-001",
 *     "studentId": "student-123",
 *     "assignmentId": "assign-001",
 *     "courseId": "course-001",
 *     "submittedAt": "2024-01-25T10:30:00Z"
 *   }
 * }
 * 
 * Kafka Topic: PROCESS_SUBMISSION
 * Key: submissionId (for ordering)
 * Recipient: Analytics/Metrics Service
 * 
 * @param payload - Submission data (without timestamp/messageId)
 * @throws Error if message send fails
 * @exported Used in submissionHandler.ts
 */
export const publishProcessSubmission = async (
  payload: Omit<ProcessSubmissionPayload, 'timestamp' | 'messageId'>
): Promise<void> => {
  const producer = await getProducer();
  
  const fullPayload: ProcessSubmissionPayload = {
    ...payload,
    timestamp: Date.now(),
    messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  await producer.send({
    topic: KAFKA_TOPICS_PRODUCE.PROCESS_SUBMISSION,
    messages: [
      {
        key: fullPayload.data.submissionId,
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.PROCESS_SUBMISSION} (submissionId: ${fullPayload.data.submissionId})`
  );
};

/**
 * Publish: Process Grade Event
 * ===========================
 * 
 * When called:
 * - Grade created/updated → publish event
 * - Backend notifies Analytics Service
 * 
 * Used by: Analytics Service to track grade metrics
 * - Average score per assignment
 * - Grade distribution (A, B, C, etc)
 * - Grade trends over time
 * - Student performance timeline
 * 
 * Message Payload:
 * {
 *   "source": "logic-service",
 *   "timestamp": 1234567890,
 *   "messageId": "unique-id",
 *   "data": {
 *     "gradeId": "grade-001",
 *     "studentId": "student-123",
 *     "assignmentId": "assign-001",
 *     "courseId": "course-001",
 *     "score": 85,
 *     "maxScore": 100
 *   }
 * }
 * 
 * Kafka Topic: PROCESS_GRADE
 * Key: gradeId (for ordering)
 * Recipient: Analytics/Metrics Service
 * 
 * @param payload - Grade data (without timestamp/messageId)
 * @throws Error if message send fails
 * @exported Used in gradeHandler.ts, grades.ts POST/PUT
 */
export const publishProcessGrade = async (
  payload: Omit<ProcessGradePayload, 'timestamp' | 'messageId'>
): Promise<void> => {
  const producer = await getProducer();
  
  const fullPayload: ProcessGradePayload = {
    ...payload,
    timestamp: Date.now(),
    messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  await producer.send({
    topic: KAFKA_TOPICS_PRODUCE.PROCESS_GRADE,
    messages: [
      {
        key: fullPayload.data.gradeId,
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.PROCESS_GRADE} (gradeId: ${fullPayload.data.gradeId})`
  );
};

/**
 * Publish: Response to Discord Bot
 * ==============================
 * 
 * When called:
 * - Student runs command (/grades, /my_assignments) → Handler collects data
 * - Handler publishes response message back to Discord
 * - Discord Bot receives and sends to user
 * 
 * Examples:
 * 1. /grades CS101 submitted
 *    → Backend query DB for grades
 *    → publishDiscordResponse() with formatted grades table
 *    → Discord shows results
 * 
 * 2. /my_assignments submitted
 *    → Backend queries student's assignments
 *    → publishDiscordResponse() with assignment list
 *    → Discord shows assignments
 * 
 * Message Payload:
 * {
 *   "source": "logic-service",
 *   "timestamp": 1234567890,
 *   "messageId": "unique-id",
 *   "data": {
 *     "userId": "student-123",
 *     "content": "Your grades for CS101:\nAssignment 1: 85/100",
 *     "format": "plaintext" | "embed"
 *   }
 * }
 * 
 * Kafka Topic: DISCORD_RESPONSE
 * Key: userId (for ordering per user)
 * Recipient: Discord Bot Service
 * 
 * @param payload - Response data (without timestamp/messageId)
 * @throws Error if message send fails
 * @exported Used in commandHandler.ts
 */
export const publishDiscordResponse = async (
  payload: Omit<DiscordResponsePayload, 'timestamp' | 'messageId'>
): Promise<void> => {
  const producer = await getProducer();
  
  const fullPayload: DiscordResponsePayload = {
    ...payload,
    timestamp: Date.now(),
    messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  await producer.send({
    topic: KAFKA_TOPICS_PRODUCE.DISCORD_RESPONSE,
    messages: [
      {
        key: fullPayload.data.userId,
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.DISCORD_RESPONSE} (userId: ${fullPayload.data.userId})`
  );
};

/**
 * Generic Publish
 * ==============
 * 
 * Low-level publish for custom topics not covered above
 * Prefer specific functions (publishAIAnswerTicket, etc) when possible
 * 
 * Used for: edge cases, experimental features, one-off events
 * 
 * @param topic - Kafka topic name
 * @param message - Message object (must include messageId)
 * @throws Error if message send fails
 * @exported Used in rare situations only
 */
export const publish = async (
  topic: string,
  message: ProducedKafkaMessage
): Promise<void> => {
  const producer = await getProducer();

  await producer.send({
    topic,
    messages: [
      {
        key: message.messageId,
        value: JSON.stringify(message),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(`📤 Sent: ${topic}`);
};

/**
 * Close Producer (Graceful Shutdown)
 * =================================
 * 
 * Called during application shutdown:
 * - Flush pending messages to broker
 * - Close connection
 * - Clean up resources
 * 
 * Important for:
 * - Not losing in-flight messages
 * - Kubernetes: pod termination
 * - Docker: container stop
 * 
 * @exported Used in index.ts shutdown()
 */
export const closeProducer = async (): Promise<void> => {
  if (producerInstance) {
    try {
      await producerInstance.disconnect();
      console.log('✅ Kafka Producer closed');
      producerInstance = null;
    } catch (err) {
      console.error('❌ Error closing Kafka Producer:', err);
    }
  }
};

export default {
  publishAIAnswerTicket,
  publishAISummarizeDoc,
  publishNotification,
  publishProcessSubmission,
  publishProcessGrade,
  publishDiscordResponse,
  publish,
  closeProducer,
};
