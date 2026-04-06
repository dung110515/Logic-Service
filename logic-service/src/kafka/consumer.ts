import { Kafka, Consumer, logLevel } from 'kafkajs';
import { config } from '../config/env';
import {
  KAFKA_TOPICS_SUBSCRIBE,
  KAFKA_TOPICS_CONSUME,
  KAFKA_CONSUMER_GROUP,
} from '../config/constants';

let consumerInstance: Consumer | null = null;

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

const loadHandlers = async () => {
  try {
    console.log('📂 Loading Kafka handlers...');

    const [
      documentHandler,
      submissionHandler,
      commandHandler,
      contextHandler,
      aiQuizHandler,
      gradeHandler,
      quizHandler,
    ] = await Promise.all([
      import('./handlers/documentHandler'),
      import('./handlers/submissionHandler'),
      import('./handlers/commandHandler'),
      import('./handlers/contextHandler'),
      import('./handlers/aiQuizHandler'),
      import('./handlers/gradeHandler'),
      import('./handlers/quizHandler'),
    ]);

    const handlers: Record<string, (payload: any) => Promise<void>> = {

      [KAFKA_TOPICS_CONSUME.FILE_UPLOADED]: documentHandler.default,
      [KAFKA_TOPICS_CONSUME.SUBMISSION_CREATED]: submissionHandler.default,
      [KAFKA_TOPICS_CONSUME.COMMAND_REQUESTED]: commandHandler.default,
      [KAFKA_TOPICS_CONSUME.TICKET_CREATED]: contextHandler.default,

      [KAFKA_TOPICS_CONSUME.AI_RESPONSE_QUIZ]: aiQuizHandler.default,
      [KAFKA_TOPICS_CONSUME.AI_RESPONSE_GRADE]: gradeHandler.default,

      [KAFKA_TOPICS_CONSUME.WEB_QUIZ_SUBMITTED]: quizHandler.default,
    };

    console.log(`✅ Loaded ${Object.keys(handlers).length} handlers`);
    return handlers;
  } catch (error) {
    console.error('❌ Error loading handlers:', error);
    throw error;
  }
};

export const startConsumer = async (): Promise<void> => {
  try {
    const consumer = await getConsumer();

    console.log(`📥 Subscribing to topics: ${KAFKA_TOPICS_SUBSCRIBE.join(', ')}`);
    await consumer.subscribe({
      topics: KAFKA_TOPICS_SUBSCRIBE,
      fromBeginning: false,
    });

    const handlers = await loadHandlers();

    await consumer.run({

      partitionsConsumedConcurrently: 1,

      eachMessage: async ({ topic, partition, message }) => {
        try {

          if (!message.value) {
            console.warn(`⚠️ Empty message on topic ${topic}`);
            return;
          }

          const payload = JSON.parse(message.value.toString());

          const handler = handlers[topic as keyof typeof handlers] as ((payload: any) => Promise<void>) | undefined;
          if (!handler) {
            console.warn(`⚠️ No handler for topic: ${topic}`);
            return;
          }

          console.log(`📥 Received: ${topic} (partition: ${partition})`);

          await handler(payload);

          console.log(`✅ Processed: ${topic}`);
        } catch (error) {

          console.error(`❌ Error processing message:`, {
            topic,
            partition,
            error: error instanceof Error ? error.message : error,
          });
        }
      },
    });

    console.log('✅ Kafka Consumer started');
  } catch (error) {
    console.error('❌ Error starting Kafka Consumer:', error);
    throw error;
  }
};

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

export const isConsumerRunning = (): boolean => {
  return consumerInstance !== null;
};

export default {
  startConsumer,
  stopConsumer,
  isConsumerRunning,
};
