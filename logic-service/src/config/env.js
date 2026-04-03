"use strict";
/**
 * Cấu hình biến môi trường - Load và validate từ .env
 * Sử dụng Zod để kiểm tra kiểu dữ liệu (type-safe)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = require("dotenv");
const path_1 = require("path");
const fs_1 = require("fs");
/**
 * Load .env file từ project root
 */
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
/**
 * Load Google Sheets credentials từ file nếu GOOGLE_CREDENTIALS_JSON_FILE được cấu hình
 */
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
// ============================================
// SCHEMA VALIDATION (Zod)
// ============================================
/**
 * Schema định nghĩa tất cả biến môi trường bắt buộc
 * Zod sẽ validate kiểu dữ liệu, giá trị mặc định, v.v.
 */
const envSchema = zod_1.z.object({
    // ===== NODE.js & Express =====
    /**
     * Môi trường chạy: development | staging | production
     * Dev: logs chi tiết, stack traces
     * Production: logs tối thiểu, no stack traces
     */
    NODE_ENV: zod_1.z.enum(['development', 'staging', 'production']).default('development'),
    /**
     * Cổng server Express lắng nghe
     * Mặc định: 8003
     */
    PORT: zod_1.z.coerce.number().default(8003),
    /**
     * Secret key cho X-Service-Token validation
     * Dùng để xác thực các request từ service khác (Web Service, Proxy, v.v.)
     */
    SERVICE_TOKEN_SECRET: zod_1.z.string().optional(),
    // ===== DATABASE (PostgreSQL) =====
    /**
     * Connection string PostgreSQL
     * Format: postgresql://user:password@host:port/database
     * Ví dụ: postgresql://soa:soa@localhost:5432/logic
     */
    DATABASE_URL: zod_1.z
        .string()
        .min(1, 'DATABASE_URL không thể trống')
        .refine(value => hasAllowedPrefix(value, ['postgresql://', 'mysql://']), 'DATABASE_URL phải bắt đầu bằng postgresql:// hoặc mysql://'),
    // ===== KAFKA MESSAGE BROKER =====
    /**
     * Địa chỉ Kafka broker
     * Format: host:port hoặc host1:port1,host2:port2 (nếu cluster)
     * Local Docker: kafka:9092 (internal) hoặc localhost:9094 (external)
     */
    KAFKA_BROKER: zod_1.z.string().min(1, 'KAFKA_BROKER không thể trống'),
    /**
     * Username cho Kafka (nếu có authentication)
     * Optional - có thể để trống
     */
    KAFKA_USERNAME: zod_1.z.string().optional(),
    /**
     * Password cho Kafka (nếu có authentication)
     * Optional - có thể để trống
     */
    KAFKA_PASSWORD: zod_1.z.string().optional(),
    // ===== REDIS CACHE =====
    /**
     * Connection string Redis
     * Format: redis://[:password@]host:port/db
     * Ví dụ: redis://localhost:6379/0
     */
    REDIS_URL: zod_1.z
        .string()
        .min(1, 'REDIS_URL không thể trống')
        .refine(value => hasAllowedPrefix(value, ['redis://', 'rediss://']), 'REDIS_URL phải bắt đầu bằng redis:// hoặc rediss://'),
    // ===== GOOGLE SHEETS API (Optional) =====
    /**
     * JSON credentials cho Google Sheets API
     * Dạng: stringified JSON từ Google Cloud Service Account
     * Optional - chỉ cần nếu sử dụng sheetsService
     */
    GOOGLE_CREDENTIALS_JSON: zod_1.z.string().optional(),
    /**
     * ID của Google Sheet để đồng bộ dữ liệu
     * Optional - chỉ cần nếu sử dụng sheetsService
     * Ví dụ: 1A2B3C4D5E6F7G8H9I0J...
     */
    GOOGLE_SHEET_ID: zod_1.z.string().optional(),
    // ===== LOGGING =====
    /**
     * Log level: error | warn | info | debug
     * Ít level chi tiết hơn: error < warn < info < debug
     */
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    /**
     * Có ghi log vào file không: true/false
     * Default: false (chỉ console)
     */
    LOG_TO_FILE: zod_1.z.string().transform(val => val === 'true').default('false'),
    // ===== DISCORD INTEGRATION (Optional) =====
    /**
     * Discord Bot token (nếu Logic Service giao tiếp trực tiếp với Bot)
     * Optional - thường Bot gửi qua Kafka, không cần token ở đây
     */
    DISCORD_BOT_TOKEN: zod_1.z.string().optional(),
    // ===== MINIO / FILE STORAGE (Optional) =====
    /**
     * MinIO server endpoint (S3-compatible)
     * Ví dụ: http://localhost:9000 hoặc https://minio.example.com
     * Optional - dùng để backup file từ Discord
     */
    MINIO_ENDPOINT: zod_1.z
        .string()
        .refine(value => hasAllowedPrefix(value, ['http://', 'https://']), 'MINIO_ENDPOINT phải bắt đầu bằng http:// hoặc https://')
        .optional(),
    /**
     * MinIO access key
     * Optional - dùng kèm MINIO_ENDPOINT
     */
    MINIO_ACCESS_KEY: zod_1.z.string().optional(),
    /**
     * MinIO secret key
     * Optional - dùng kèm MINIO_ENDPOINT
     */
    MINIO_SECRET_KEY: zod_1.z.string().optional(),
    /**
     * MinIO bucket name
     * Optional - dùng kèm MINIO_ENDPOINT
     */
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
// ============================================
// PARSE & VALIDATE
// ============================================
/**
 * Parse biến môi trường từ process.env
 * Zod sẽ kiểm tra:
 * 1. Biến bắt buộc có tồn tại không
 * 2. Kiểu dữ liệu có đúng không
 * 3. Giá trị có hợp lệ không (URL, enum, v.v.)
 */
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
// ============================================
// EXPORT FINAL CONFIG
// ============================================
/**
 * Config object - sử dụng xuyên suốt ứng dụng
 * Đã được validate type-safe bởi Zod
 *
 * Cách dùng:
 * ```typescript
 * import { config } from './config/env';
 * console.log(config.DATABASE_URL);
 * console.log(config.PORT);
 * ```
 */
exports.config = {
    // Node.js
    nodeEnv: parsedEnv.NODE_ENV,
    isDev: parsedEnv.NODE_ENV === 'development',
    isProd: parsedEnv.NODE_ENV === 'production',
    port: parsedEnv.PORT,
    serviceTokenSecret: parsedEnv.SERVICE_TOKEN_SECRET?.trim() || 'dev-local-service-token-change-me',
    // Database
    databaseUrl: parsedEnv.DATABASE_URL,
    // Kafka
    kafkaBroker: parsedEnv.KAFKA_BROKER,
    kafkaUsername: parsedEnv.KAFKA_USERNAME,
    kafkaPassword: parsedEnv.KAFKA_PASSWORD,
    // Redis
    redisUrl: parsedEnv.REDIS_URL,
    // Google Sheets
    googleCredentialsJson: parsedEnv.GOOGLE_CREDENTIALS_JSON,
    googleSheetId: parsedEnv.GOOGLE_SHEET_ID,
    // Logging
    logLevel: parsedEnv.LOG_LEVEL,
    logToFile: parsedEnv.LOG_TO_FILE,
    // Discord
    discordBotToken: parsedEnv.DISCORD_BOT_TOKEN,
    // MinIO
    minioEndpoint: parsedEnv.MINIO_ENDPOINT,
    minioAccessKey: parsedEnv.MINIO_ACCESS_KEY,
    minioSecretKey: parsedEnv.MINIO_SECRET_KEY,
    minioBucket: parsedEnv.MINIO_BUCKET,
};
// Debug log (chỉ trong development)
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
