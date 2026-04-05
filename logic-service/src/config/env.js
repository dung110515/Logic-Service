"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = require("dotenv");
const path_1 = require("path");
const fs_1 = require("fs");

const envFilePath = (0, path_1.resolve)(process.cwd(), '.env');
const dotenvResult = dotenv_1.default.config({ path: envFilePath });
if (dotenvResult.error) {
    const dotenvError = dotenvResult.error;
    if (dotenvError.code === 'ENOENT') {
        console.warn(`⚠️ Không tìm thấy file .env tại ${envFilePath}. Sẽ dùng biến môi trường hệ thống nếu có.`);
    }
    else {
        console.warn(`⚠️ Lỗi khi đọc file .env: ${dotenvError.message}`);
    }
}

if (process.env.GOOGLE_CREDENTIALS_JSON_FILE && !process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
        const credFilePath = (0, path_1.resolve)(process.cwd(), process.env.GOOGLE_CREDENTIALS_JSON_FILE);
        const credFileContent = (0, fs_1.readFileSync)(credFilePath, 'utf-8');
        process.env.GOOGLE_CREDENTIALS_JSON = credFileContent;
    }
    catch (error) {
        console.warn(`⚠️ Không thể đọc file credentials: ${process.env.GOOGLE_CREDENTIALS_JSON_FILE}`);
    }
}
const hasAllowedPrefix = (value, prefixes) => prefixes.some(prefix => value.startsWith(prefix));
const formatSafeEndpoint = (value) => {
    try {
        const parsed = new URL(value);
        const databaseName = parsed.pathname.replace(/^\//, '');
        const base = `${parsed.protocol}//${parsed.host}`;
        return databaseName ? `${base}/${databaseName}` : base;
    }
    catch {
        return value;
    }
};

const envSchema = zod_1.z.object({

    NODE_ENV: zod_1.z.enum(['development', 'staging', 'production']).default('development'),

    PORT: zod_1.z.coerce.number().default(8003),

    SERVICE_TOKEN_SECRET: zod_1.z.string().optional(),

    DATABASE_URL: zod_1.z
        .string()
        .min(1, 'DATABASE_URL không thể trống')
        .refine(value => hasAllowedPrefix(value, ['postgresql://', 'mysql://']), 'DATABASE_URL phải bắt đầu bằng postgresql:// hoặc mysql://'),

    KAFKA_BROKER: zod_1.z.string().min(1, 'KAFKA_BROKER không thể trống'),

    KAFKA_USERNAME: zod_1.z.string().optional(),

    KAFKA_PASSWORD: zod_1.z.string().optional(),

    REDIS_URL: zod_1.z
        .string()
        .min(1, 'REDIS_URL không thể trống')
        .refine(value => hasAllowedPrefix(value, ['redis://', 'rediss://']), 'REDIS_URL phải bắt đầu bằng redis:// hoặc rediss://'),

    GOOGLE_CREDENTIALS_JSON: zod_1.z.string().optional(),

    GOOGLE_SHEET_ID: zod_1.z.string().optional(),

    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),

    LOG_TO_FILE: zod_1.z.string().transform(val => val === 'true').default('false'),

    DISCORD_BOT_TOKEN: zod_1.z.string().optional(),

    MINIO_ENDPOINT: zod_1.z
        .string()
        .refine(value => hasAllowedPrefix(value, ['http://', 'https://']), 'MINIO_ENDPOINT phải bắt đầu bằng http:// hoặc https://')
        .optional(),

    MINIO_ACCESS_KEY: zod_1.z.string().optional(),

    MINIO_SECRET_KEY: zod_1.z.string().optional(),

    MINIO_BUCKET: zod_1.z.string().optional(),
}).superRefine((data, ctx) => {
    const token = data.SERVICE_TOKEN_SECRET?.trim();
    if (data.NODE_ENV === 'production') {
        if (!token) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['SERVICE_TOKEN_SECRET'],
                message: 'SERVICE_TOKEN_SECRET là bắt buộc khi NODE_ENV=production',
            });
            return;
        }
        if (token.length < 16) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['SERVICE_TOKEN_SECRET'],
                message: 'SERVICE_TOKEN_SECRET phải có ít nhất 16 ký tự khi NODE_ENV=production',
            });
        }
        return;
    }
    if (token && token.length < 16) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['SERVICE_TOKEN_SECRET'],
            message: 'SERVICE_TOKEN_SECRET nếu được cấu hình thì phải có ít nhất 16 ký tự',
        });
    }
});

let parsedEnv;
try {
    parsedEnv = envSchema.parse(process.env);
}
catch (error) {
    if (error instanceof zod_1.z.ZodError) {
        console.error('❌ Environment validation error:');
        error.errors.forEach(err => {
            const path = err.path.join('.');
            console.error(`  • ${path}: ${err.message}`);
        });
        process.exit(1);
    }
    throw error;
}

exports.config = {

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
};

if (exports.config.isDev) {
    console.log('✅ Environment configured:');
    console.log(`  • NODE_ENV: ${exports.config.nodeEnv}`);
    console.log(`  • PORT: ${exports.config.port}`);
    console.log(`  • DATABASE: ${formatSafeEndpoint(exports.config.databaseUrl)}`);
    console.log(`  • KAFKA: ${exports.config.kafkaBroker}`);
    console.log(`  • REDIS: ${formatSafeEndpoint(exports.config.redisUrl)}`);
    if (!parsedEnv.SERVICE_TOKEN_SECRET) {
        console.warn('⚠️ SERVICE_TOKEN_SECRET chưa cấu hình. Đang dùng fallback local cho development.');
    }
}
