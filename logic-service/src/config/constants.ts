export const KAFKA_TOPICS_CONSUME = {

  FILE_UPLOADED: 'lms.discord.file.uploaded',

  SUBMISSION_CREATED: 'lms.discord.submission.created',

  COMMAND_REQUESTED: 'lms.discord.command.requested',

  TICKET_CREATED: 'lms.discord.ticket.created',

  AI_RESPONSE_QUIZ: 'lms.ai.response.quiz',

  AI_RESPONSE_GRADE: 'lms.ai.response.grade',

  WEB_QUIZ_SUBMITTED: 'lms.web.quiz.submitted',
} as const;

export const KAFKA_TOPICS_PRODUCE = {

  AI_REQUEST_ANSWER_TICKET: 'lms.ai.request.answer_ticket',

  AI_REQUEST_SUMMARIZE_DOC: 'lms.ai.request.summarize_doc',

  NOTIFICATION_SEND_DM: 'lms.notification.send.dm',

  PROCESS_SUBMISSION: 'lms.logic.process.submission',

  PROCESS_GRADE: 'lms.logic.process.grade',

  DISCORD_RESPONSE: 'lms.discord.response',
} as const;

export const KAFKA_TOPICS = {
  ...KAFKA_TOPICS_CONSUME,
  ...KAFKA_TOPICS_PRODUCE,
} as const;

export const KAFKA_CONSUMER_GROUP = 'logic-service-group' as const;

export const KAFKA_TOPICS_SUBSCRIBE = Object.values(KAFKA_TOPICS_CONSUME);

export const REDIS_CACHE = {

  COURSE_SERVER: {
    pattern: 'course:server:{discordServerId}',
    ttl: 5 * 60,
  },

  USER_DISCORD: {
    pattern: 'user:discord:{discordId}',
    ttl: 10 * 60,
  },

  QA_ANSWER: {
    pattern: 'qa:cache:{questionHash}',
    ttl: 60 * 60,
  },

  COURSE_STATS: {
    pattern: 'course:stats:{courseId}',
    ttl: 2 * 60,
  },

  CONTEXT: {
    pattern: 'context:{studentId}:{courseId}',
    ttl: 5 * 60,
  },
} as const;

export const KAFKA_HANDLER_MAP = {

  [KAFKA_TOPICS_CONSUME.FILE_UPLOADED]: 'documentHandler',

  [KAFKA_TOPICS_CONSUME.SUBMISSION_CREATED]: 'submissionHandler',

  [KAFKA_TOPICS_CONSUME.COMMAND_REQUESTED]: 'commandHandler',

  [KAFKA_TOPICS_CONSUME.TICKET_CREATED]: 'contextHandler',

  [KAFKA_TOPICS_CONSUME.AI_RESPONSE_QUIZ]: 'aiQuizHandler',

  [KAFKA_TOPICS_CONSUME.AI_RESPONSE_GRADE]: 'gradeHandler',

  [KAFKA_TOPICS_CONSUME.WEB_QUIZ_SUBMITTED]: 'quizHandler',
} as const;

export const RETRY_CONFIG = {

  MAX_RETRIES: 3,

  BASE_DELAY_MS: 1000,

  MAX_DELAY_MS: 30000,
} as const;

export const API_CONFIG = {

  REQUEST_TIMEOUT_MS: 30000,

  MAX_REQUEST_SIZE: '10mb',

  PUBLIC_ENDPOINTS: [
    '/health',
    '/health/ready',
    '/health/live',
  ],
} as const;

export const LOGGER_CONFIG = {

  LEVEL: process.env.NODE_ENV === 'production' ? 'warn' : 'info',

  FORMAT: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',

  FILES: {
    error: 'logs/error.log',
    combined: 'logs/combined.log',
  },
} as const;

export type KafkaTopic = typeof KAFKA_TOPICS[keyof typeof KAFKA_TOPICS];

export type RedisCacheKey = keyof typeof REDIS_CACHE;
