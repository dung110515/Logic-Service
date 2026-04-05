import { z } from 'zod';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const envFilePath = resolve(process.cwd(), '.env');
const dotenvResult = dotenv.config({ path: envFilePath });

if (dotenvResult.error) {
  const dotenvError = dotenvResult.error as NodeJS.ErrnoException;
  if (dotenvError.code === 'ENOENT') {
    console.warn(`⚠️ Không tìm thấy file .env tại ${envFilePath}. Sẽ dùng biến môi trường hệ thống nếu có.`);
  } else {
    console.warn(`⚠️ Lỗi khi đọc file .env: ${dotenvError.message}`);
  }
}

if (process.env.GOOGLE_CREDENTIALS_JSON_FILE && !process.env.GOOGLE_CREDENTIALS_JSON) {
  try {
    const credFilePath = resolve(process.cwd(), process.env.GOOGLE_CREDENTIALS_JSON_FILE);
    const credFileContent = readFileSync(credFilePath, 'utf-8');
    process.env.GOOGLE_CREDENTIALS_JSON = credFileContent;
  } catch (error) {
    console.warn(`⚠️ Không thể đọc file credentials: ${process.env.GOOGLE_CREDENTIALS_JSON_FILE}`);
  }
}

const hasAllowedPrefix = (value: string, prefixes: string[]): boolean =>
  prefixes.some(prefix => value.startsWith(prefix));

const formatSafeEndpoint = (value: string): string => {
  try {
    const parsed = new URL(value);
    const databaseName = parsed.pathname.replace(/^\//, '');
    const base = `${parsed.protocol}//${parsed.host}`;
    return databaseName ? `${base}/${databaseName}` : base;
  } catch {
    return value;
  }
};

const envSchema = z.object({

  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  PORT: z.coerce.number().default(8003),

  SERVICE_TOKEN_SECRET: z.string().optional(),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL không thể trống')
    .refine(
      value => hasAllowedPrefix(value, ['postgresql://', 'mysql://']),
      'DATABASE_URL phải bắt đầu bằng postgresql:// hoặc mysql://'
    ),

  KAFKA_BROKER: z.string().min(1, 'KAFKA_BROKER không thể trống'),

  KAFKA_USERNAME: z.string().optional(),

  KAFKA_PASSWORD: z.string().optional(),

  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL không thể trống')
    .refine(
      value => hasAllowedPrefix(value, ['redis://', 'rediss://']),
      'REDIS_URL phải bắt đầu bằng redis:// hoặc rediss://'
    ),

  GOOGLE_CREDENTIALS_JSON: z.string().optional(),

  GOOGLE_SHEET_ID: z.string().optional(),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  LOG_TO_FILE: z.string().transform(val => val === 'true').default('false'),

  DISCORD_BOT_TOKEN: z.string().optional(),

  MINIO_ENDPOINT: z
    .string()
    .refine(
      value => hasAllowedPrefix(value, ['http://', 'https://']),
      'MINIO_ENDPOINT phải bắt đầu bằng http:// hoặc https://'
    )
    .optional(),

  MINIO_ACCESS_KEY: z.string().optional(),

  MINIO_SECRET_KEY: z.string().optional(),

  MINIO_BUCKET: z.string().optional(),
}).superRefine((data, ctx) => {

  const token = data.SERVICE_TOKEN_SECRET?.trim();

  if (data.NODE_ENV === 'production') {

    if (!token) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SERVICE_TOKEN_SECRET'],
        message: 'SERVICE_TOKEN_SECRET là bắt buộc khi NODE_ENV=production',
      });
      return;
    }

    if (token.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SERVICE_TOKEN_SECRET'],
        message: 'SERVICE_TOKEN_SECRET phải có ít nhất 16 ký tự khi NODE_ENV=production',
      });
    }
    return;
  }

  if (token && token.length < 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SERVICE_TOKEN_SECRET'],
      message: 'SERVICE_TOKEN_SECRET nếu được cấu hình thì phải có ít nhất 16 ký tự',
    });
  }
});

let parsedEnv: z.infer<typeof envSchema>;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {

  if (error instanceof z.ZodError) {
    console.error('❌ Environment validation error:');
    error.errors.forEach(err => {
      const path = err.path.join('.');
      console.error(`  • ${path}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export const config = {

  nodeEnv: parsedEnv.NODE_ENV,
  isDev: parsedEnv.NODE_ENV === 'development',
  isProd: parsedEnv.NODE_ENV === 'production',

  port: parsedEnv.PORT,
  serviceTokenSecret: parsedEnv.SERVICE_TOKEN_SECRET?.trim() || 'dev-local-service-token-change-me',

  databaseUrl: parsedEnv.DATABASE_URL,

  kafkaBroker: parsedEnv.KAFKA_BROKER,
  kafkaUsername: parsedEnv.KAFKA_USERNAME,
  kafkaPassword: parsedEnv.KAFKA_PASSWORD,

  redisUrl: parsedEnv.REDIS_URL,

  googleCredentialsJson: parsedEnv.GOOGLE_CREDENTIALS_JSON,
  googleSheetId: parsedEnv.GOOGLE_SHEET_ID,

  logLevel: parsedEnv.LOG_LEVEL,
  logToFile: parsedEnv.LOG_TO_FILE,

  discordBotToken: parsedEnv.DISCORD_BOT_TOKEN,

  minioEndpoint: parsedEnv.MINIO_ENDPOINT,
  minioAccessKey: parsedEnv.MINIO_ACCESS_KEY,
  minioSecretKey: parsedEnv.MINIO_SECRET_KEY,
  minioBucket: parsedEnv.MINIO_BUCKET,
} as const;

export type Config = typeof config;

if (config.isDev) {
  console.log('✅ Environment configured:');
  console.log(`  • NODE_ENV: ${config.nodeEnv}`);
  console.log(`  • PORT: ${config.port}`);
  console.log(`  • DATABASE: ${formatSafeEndpoint(config.databaseUrl)}`);
  console.log(`  • KAFKA: ${config.kafkaBroker}`);
  console.log(`  • REDIS: ${formatSafeEndpoint(config.redisUrl)}`);
  if (!parsedEnv.SERVICE_TOKEN_SECRET) {
    console.warn('⚠️ SERVICE_TOKEN_SECRET chưa cấu hình. Đang dùng fallback local cho development.');
  }
}
