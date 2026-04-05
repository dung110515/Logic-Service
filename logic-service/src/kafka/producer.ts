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

let producerInstance: Producer | null = null;

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

const getProducer = async (): Promise<Producer> => {

  if (producerInstance) {
    return producerInstance;
  }

  const kafka = initKafkaClient();
  producerInstance = kafka.producer({
    idempotent: true,
    allowAutoTopicCreation: true,
    retry: {
      initialRetryTime: 100,
      retries: 8,
      maxRetryTime: 30000,
    },
  });

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

export const publishAIAnswerTicket = async (
  payload: Omit<AIRequestAnswerTicketPayload, 'timestamp' | 'messageId'>
): Promise<void> => {
  const producer = await getProducer();

  const fullPayload: AIRequestAnswerTicketPayload = {
    ...payload,
    timestamp: Date.now(),
    messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  await producer.send({
    topic: KAFKA_TOPICS_PRODUCE.AI_REQUEST_ANSWER_TICKET,
    messages: [
      {
        key: fullPayload.data.ticketId,
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.AI_REQUEST_ANSWER_TICKET} (ticketId: ${fullPayload.data.ticketId})`
  );
};

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
        key: fullPayload.data.documentId,
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.AI_REQUEST_SUMMARIZE_DOC} (docId: ${fullPayload.data.documentId})`
  );
};

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
        key: fullPayload.data.userId,
        value: JSON.stringify(fullPayload),
        timestamp: Date.now().toString(),
      },
    ],
  });

  console.log(
    `📤 Sent: ${KAFKA_TOPICS_PRODUCE.NOTIFICATION_SEND_DM} (userId: ${fullPayload.data.userId})`
  );
};

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
