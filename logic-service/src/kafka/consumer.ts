/**
 * Kafka Consumer - Event Listener
 * ================================
 * 
 * Mục đích:
 * - Subscribe to Kafka topics from other services
 * - Receive and process events (asynchronously)
 * - Route messages to correct handler functions
 * - Handle errors gracefully without crashing
 * 
 * Architecture:
 * 
 * Service 1         Service 2          Service 3         Logic Service
 * (Discord)         (Web)              (AI Service)      (This service)
 *    │                 │                    │                 │
 *    ├─ FILE_UPLOADED──┤                    │                 │
 *    │                 │                    │                 │
 *    ├─ SUBMISSION─────┤                    │                 │
 *    │                 │                    │                 │
 *    │              WEB_QUIZ_SUBMITTED      │                 │
 *    │                 │                    │                 │
 *    │                 │         AI_RESPONSE_GRADE             │
 *    │                 │                    │                 │
 *    └────────────────────────────────────>│ Kafka Broker │────────────────────>│
 *                                           │                 │
 *                                        Kafka Consumer (this service)
 *                                           │
 *        ┌──────────────────────────────────┼──────────────────────────┐
 *        ▼                                   ▼                          ▼
 *    documentHandler              submissionHandler           gradeHandler
 *    (saves PDF)                  (saves to DB)               (updates grade)
 * 
 * Topics Subscribed:
 * - FILE_UPLOADED (Discord: user uploaded file)
 * - SUBMISSION_CREATED (Discord: user submitted assignment)
 * - COMMAND_REQUESTED (Discord: user ran /grades command)
 * - TICKET_CREATED (Discord: user asked Q&A question)
 * - WEB_QUIZ_SUBMITTED (Web: user submitted quiz)
 * - AI_RESPONSE_QUIZ (AI Service: AI generated quiz)
 * - AI_RESPONSE_GRADE (AI Service: AI graded assignment)
 * 
 * Consumer Setup:
 * 1. Connect to Kafka broker (brokers list from config)
 * 2. Create consumer with groupId (allows parallel consumers)
 * 3. Subscribe to all topics
 * 4. Start listening (eachMessage handler)
 * 5. Route each message to handler based on topic
 * 
 * Error Handling:
 * - If handler throws: log error, continue (don't crash)
 * - If message malformed: skip and move to next
 * - If connection lost: reconnect automatically
 * - If handler fails: could add retry queue later
 * 
 * Singleton Pattern:
 * - Only one consumer instance per process
 * - Prevents duplicate message consumption
 * - Reused across requests
 */

import { Kafka, Consumer, logLevel } from 'kafkajs';
import { config } from '../config/env';
import {
  KAFKA_TOPICS_SUBSCRIBE,
  KAFKA_TOPICS_CONSUME,
  KAFKA_CONSUMER_GROUP,
} from '../config/constants';

/**
 * Global Consumer Instance
 * =======================
 * Singleton: only one consumer per process
 * Null until @function startConsumer() is called
 * Set to null again after @function stopConsumer() is called
 */
let consumerInstance: Consumer | null = null;

/**
 * Initialize Kafka Client
 * =======================
 * 
 * Creates Kafka client with configuration:
 * - brokers: list of Kafka broker servers
 * - logLevel: DEBUG in dev, ERROR in prod
 * - retry: reconnect if connection fails
 * - SASL/SSL: auth if credentials provided
 * 
 * @returns Kafka client instance
 * @private Internal use only
 */
const initKafkaClient = (): Kafka => {
  return new Kafka({
    // ===== Brokers Configuration =====
    // Can be: "localhost:9092" or "broker1:9092,broker2:9092"
    // Split comma-separated list into array
    brokers: config.kafkaBroker.includes(',')
      ? config.kafkaBroker.split(',')
      : [config.kafkaBroker],

    // ===== Logging Level =====
    // DEBUG: verbose logs in development
    // ERROR: only errors in production
    logLevel: config.nodeEnv === 'development' ? logLevel.DEBUG : logLevel.ERROR,

    // ===== Retry Configuration =====
    // If connection fails: retry up to 8 times
    // Initial wait: 100ms, max wait: 30s
    retry: {
      initialRetryTime: 100,
      retries: 8,
      maxRetryTime: 30000,
    },

    // ===== Authentication (if configured) =====
    // If username/password provided in .env:
    // - Use PLAIN SASL mechanism
    // - Enable SSL encryption
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
 * Get or Create Consumer Singleton
 * ================================
 * 
 * Logic:
 * - If consumer already created: return it
 * - If first time: create, setup listeners, connect
 * 
 * Listeners:
 * - consumer.connect: logs success
 * - consumer.disconnect: logs warning
 * - consumer.crash: logs error (critical)
 * - consumer.network.request_timeout: logs warning
 * 
 * @returns Consumer instance
 * @throws Error if connection fails
 * @private Internal use only
 */
const getConsumer = async (): Promise<Consumer> => {
  // If already created, return cached instance
  if (consumerInstance) {
    return consumerInstance;
  }

  // Create new Kafka client
  const kafka = initKafkaClient();

  // Create consumer with group
  consumerInstance = kafka.consumer({
    groupId: KAFKA_CONSUMER_GROUP, // e.g., "logic-service-group"
    sessionTimeout: 30000,         // 30s: time allowed to process message
    heartbeatInterval: 3000,       // 3s: keep-alive ping to broker
    rebalanceTimeout: 60000,       // 60s: rebalance timeout (add/remove consumers)
  });

  // ===== Event Listeners =====
  consumerInstance.on('consumer.connect', () => {
    console.log('✅ Kafka Consumer connected');
  });

  consumerInstance.on('consumer.disconnect', () => {
    console.warn('⚠️ Kafka Consumer disconnected');
  });

  consumerInstance.on('consumer.crash', (event) => {
    console.error(`❌ Kafka Consumer crashed`, event);
  });

  consumerInstance.on('consumer.network.request_timeout', () => {
    console.warn('⚠️ Kafka Consumer network timeout');
  });

  // Connect to broker
  await consumerInstance.connect();
  return consumerInstance;
};

/**
 * Load Message Handlers
 * ====================
 * 
 * Dynamically imports all handler functions
 * Creates topic → handler mapping
 * 
 * Why dynamic import?
 * - Avoids circular dependency issues
 * - Handlers can import from various modules
 * - Handlers loaded only when needed
 * 
 * Handlers Loaded:
 * - documentHandler: FILE_UPLOADED
 * - submissionHandler: SUBMISSION_CREATED
 * - commandHandler: COMMAND_REQUESTED
 * - contextHandler: TICKET_CREATED
 * - aiQuizHandler: AI_RESPONSE_QUIZ
 * - gradeHandler: AI_RESPONSE_GRADE
 * - quizHandler: WEB_QUIZ_SUBMITTED
 * 
 * @returns Map of topic name → handler function
 * @throws Error if import fails
 * @private Internal use only
 */
const loadHandlers = async () => {
  try {
    console.log('📂 Loading Kafka handlers...');

    // Dynamically import all handlers in parallel
    const [
      documentHandler,
      submissionHandler,
      commandHandler,
      contextHandler,
      aiQuizHandler,
      gradeHandler,
      quizHandler,
    ] = await Promise.all([
      import('./handlers/documentHandler.js'),
      import('./handlers/submissionHandler.js'),
      import('./handlers/commandHandler.js'),
      import('./handlers/contextHandler.js'),
      import('./handlers/aiQuizHandler.js'),
      import('./handlers/gradeHandler.js'),
      import('./handlers/quizHandler.js'),
    ]);

    // Create topic → handler mapping
    const handlers: Record<string, (payload: any) => Promise<void>> = {
      // Discord event handlers
      [KAFKA_TOPICS_CONSUME.FILE_UPLOADED]: documentHandler.default,
      [KAFKA_TOPICS_CONSUME.SUBMISSION_CREATED]: submissionHandler.default,
      [KAFKA_TOPICS_CONSUME.COMMAND_REQUESTED]: commandHandler.default,
      [KAFKA_TOPICS_CONSUME.TICKET_CREATED]: contextHandler.default,

      // AI service handlers
      [KAFKA_TOPICS_CONSUME.AI_RESPONSE_QUIZ]: aiQuizHandler.default,
      [KAFKA_TOPICS_CONSUME.AI_RESPONSE_GRADE]: gradeHandler.default,

      // Web service handlers
      [KAFKA_TOPICS_CONSUME.WEB_QUIZ_SUBMITTED]: quizHandler.default,
    };

    console.log(`✅ Loaded ${Object.keys(handlers).length} handlers`);
    return handlers;
  } catch (error) {
    console.error('❌ Error loading handlers:', error);
    throw error;
  }
};

/**
 * Start Consumer
 * ==============
 * 
 * Full startup sequence:
 * 1. Get/create consumer instance
 * 2. Subscribe to all topics (fromBeginning=false means new messages only)
 * 3. Load handler functions
 * 4. Start listening (eachMessage handler)
 * 5. Route each message to appropriate handler
 * 6. Log success/failure
 * 
 * Message Processing Flow:
 * 
 * Kafka Broker
 *     │
 *     └─> MESSAGE {topic, partition, message}
 *         │
 *         └─> eachMessage()
 *             │
 *             ├─> Parse JSON
 *             │
 *             ├─> Find handler by topic
 *             │
 *             ├─> Call handler(payload)
 *             │   (e.g., documentHandler(payload))
 *             │
 *             └─> Log result (don't throw)
 * 
 * Concurrency:
 * - partitionsConsumedConcurrently: 1
 * - Means: process messages sequentially
 * - If set to 5: could process 5 partitions in parallel
 * - Higher = throughput, Lower = ordering garantee
 * 
 * Error Recovery:
 * - If handler throws: catch, log, continue
 * - Don't crash the consumer
 * - Could add retry queue for failed messages
 * 
 * @throws Error if subscription/connection fails
 * @exported Used in index.ts at startup
 */
export const startConsumer = async (): Promise<void> => {
  try {
    const consumer = await getConsumer();

    // ===== Subscribe to Topics =====
    console.log(`📥 Subscribing to topics: ${KAFKA_TOPICS_SUBSCRIBE.join(', ')}`);
    await consumer.subscribe({
      topics: KAFKA_TOPICS_SUBSCRIBE,
      fromBeginning: false,  // Only consume new messages, not historical
    });

    // ===== Load Handlers =====
    const handlers = await loadHandlers();

    // ===== Start Message Handler =====
    await consumer.run({
      /**
       * Partition Concurrency
       * ====================
       * How many partitions to consume concurrently
       * 1: sequential (preserves order, slower)
       * 3: up to 3 parallel (trade throughput for some ordering)
       * Current: 1 (we need message order for consistent state)
       */
      partitionsConsumedConcurrently: 1,

      /**
       * Message Handler
       * ==============
       * Called for EVERY message received
       * Responsible for routing to correct handler
       * 
       * Parameters:
       * - topic: which topic message came from
       * - partition: which partition within topic
       * - message: the actual message {key, value, headers, etc}
       */
      eachMessage: async ({ topic, partition, message }) => {
        try {
          // ===== Step 1: Validate Message =====
          if (!message.value) {
            console.warn(`⚠️ Empty message on topic ${topic}`);
            return;
          }

          // ===== Step 2: Parse JSON Payload =====
          const payload = JSON.parse(message.value.toString());

          // ===== Step 3: Find Handler =====
          const handler = handlers[topic as keyof typeof handlers] as ((payload: any) => Promise<void>) | undefined;
          if (!handler) {
            console.warn(`⚠️ No handler for topic: ${topic}`);
            return;
          }

          console.log(`📥 Received: ${topic} (partition: ${partition})`);

          // ===== Step 4: Execute Handler =====
          // Handler should:
          // - Save to database
          // - Publish response events
          // - Notify users
          await handler(payload);

          console.log(`✅ Processed: ${topic}`);
        } catch (error) {
          // ===== Error Handling =====
          // Log the error but DON'T throw
          // This keeps consumer running for next message
          console.error(`❌ Error processing message:`, {
            topic,
            partition,
            error: error instanceof Error ? error.message : error,
          });
          // Future: could add retry queue or dead-letter topic
        }
      },
    });

    console.log('✅ Kafka Consumer started');
  } catch (error) {
    console.error('❌ Error starting Kafka Consumer:', error);
    throw error;
  }
};

/**
 * Stop Consumer (Graceful Shutdown)
 * =================================
 * 
 * Called during application shutdown:
 * - Leave consumer group
 * - Close connections
 * - Clean up resources
 * 
 * Important for:
 * - Kubernetes: when pod is being terminated
 * - Docker: when container stops
 * - Development: when Ctrl+C is pressed
 * 
 * @exported Used in index.ts shutdown()
 */
export const stopConsumer = async (): Promise<void> => {
  if (consumerInstance) {
    try {
      await consumerInstance.disconnect();
      console.log('✅ Kafka Consumer stopped');
      consumerInstance = null;
    } catch (err) {
      console.error('❌ Error stopping Kafka Consumer:', err);
    }
  }
};

/**
 * Check if Consumer is Running
 * =============================
 * 
 * Used in health checks:
 * - GET /health - check if consumer connected
 * - GET /health/ready - check dependencies
 * 
 * @returns true if consumer instance exists, false otherwise
 * @exported Used in health.ts endpoint
 */
export const isConsumerRunning = (): boolean => {
  return consumerInstance !== null;
};

export default {
  startConsumer,
  stopConsumer,
  isConsumerRunning,
};
