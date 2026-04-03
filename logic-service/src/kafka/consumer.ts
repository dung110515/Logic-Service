/**
 * Kafka Consumer
 * Subscribe tới các topics và xử lý messages từ các service khác
 */

import { Kafka, Consumer, logLevel } from 'kafkajs';
import { config } from '../config/env';
import {
  KAFKA_TOPICS_SUBSCRIBE,
  KAFKA_TOPICS_CONSUME,
  KAFKA_CONSUMER_GROUP,
} from '../config/constants';

/**
 * Kafka consumer singleton
 */
let consumerInstance: Consumer | null = null;

/**
 * Khởi tạo Kafka client
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
 * Lấy hoặc tạo Consumer singleton
 */
const getConsumer = async (): Promise<Consumer> => {
  if (consumerInstance) {
    return consumerInstance;
  }

  const kafka = initKafkaClient();
  consumerInstance = kafka.consumer({
    groupId: KAFKA_CONSUMER_GROUP,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    rebalanceTimeout: 60000,
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

  await consumerInstance.connect();
  return consumerInstance;
};

/**
 * Khởi tạo handler map (dynamic import)
 * Cách này tránh circular dependencies
 */
const loadHandlers = async () => {
  try {
    console.log('📂 Loading Kafka handlers...');

    // Dynamically import all handlers
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

    // Create topic to handler map
    const handlers: Record<string, (payload: any) => Promise<void>> = {
      // Discord messages
      [KAFKA_TOPICS_CONSUME.FILE_UPLOADED]: documentHandler.default,
      [KAFKA_TOPICS_CONSUME.SUBMISSION_CREATED]: submissionHandler.default,
      [KAFKA_TOPICS_CONSUME.COMMAND_REQUESTED]: commandHandler.default,
      [KAFKA_TOPICS_CONSUME.TICKET_CREATED]: contextHandler.default,

      // AI responses
      [KAFKA_TOPICS_CONSUME.AI_RESPONSE_QUIZ]: aiQuizHandler.default,
      [KAFKA_TOPICS_CONSUME.AI_RESPONSE_GRADE]: gradeHandler.default,

      // Web messages
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
 * Bắt đầu consumer
 * Subscribe tới topics, setup message handler
 */
export const startConsumer = async (): Promise<void> => {
  try {
    const consumer = await getConsumer();

    // ===== Subscribe tới tất cả topics =====
    console.log(`📥 Subscribing to topics: ${KAFKA_TOPICS_SUBSCRIBE.join(', ')}`);
    await consumer.subscribe({
      topics: KAFKA_TOPICS_SUBSCRIBE,
      fromBeginning: false, // Chỉ consumer từ messages mới, không từ cũ
    });

    // ===== Load handlers =====
    const handlers = await loadHandlers();

    // ===== Setup Message Handler =====
    await consumer.run({
      /**
       * partitionsConsumedConcurrently: Số partition consume đồng thời
       * Để 1 nếu cần preserve order, số cao hơn nếu cần throughput cao
       */
      partitionsConsumedConcurrently: 1,

      /**
       * eachMessage: Hàm xử lý mỗi message
       */
      eachMessage: async ({ topic, partition, message }) => {
        try {
          // ===== Parse Message =====
          if (!message.value) {
            console.warn(`⚠️ Empty message on topic ${topic}`);
            return;
          }

          const payload = JSON.parse(message.value.toString());

          // ===== Route tới Handler =====
          const handler = handlers[topic as keyof typeof handlers] as ((payload: any) => Promise<void>) | undefined;
          if (!handler) {
            console.warn(`⚠️ No handler for topic: ${topic}`);
            return;
          }

          console.log(`📥 Received: ${topic} (partition: ${partition})`);

          // ===== Execute Handler =====
          await handler(payload);

          console.log(`✅ Processed: ${topic}`);
        } catch (error) {
          console.error(`❌ Error processing message:`, {
            topic,
            partition,
            error: error instanceof Error ? error.message : error,
          });
          // Không throw - để consumer tiếp tục xử lý messages tiếp theo
          // Có thể thêm retry logic ở đây nếu cần
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
 * Dừng consumer
 * Gọi khi shutdown ứng dụng
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
 * Kiểm tra consumer có đang chạy không
 */
export const isConsumerRunning = (): boolean => {
  return consumerInstance !== null;
};

export default {
  startConsumer,
  stopConsumer,
  isConsumerRunning,
};
