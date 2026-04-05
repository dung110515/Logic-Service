/**
 * Environment Configuration & Validation
 * =====================================
 * 
 * Mục đích:
 * - Load environment variables from .env file
 * - Validate types and values using Zod schema
 * - Provide type-safe config object to entire application
 * - Fail early if required vars missing
 * 
 * Configuration Sources (in order):
 * 1. Load .env file from project root
 * 2. Load Google Sheets credentials if file path provided
 * 3. Use system environment variables
 * 4. Fall back to schema defaults
 * 
 * Validation with Zod:
 * ```typescript
 * const envSchema = z.object({
 *   DATABASE_URL: z.string(),        // Required
 *   PORT: z.coerce.number().default(8003),  // Optional with default
 *   LOG_LEVEL: z.enum([...]).default('info')  // Enum
 * });
 * 
 * // If validation fails: print errors + exit(1)
 * ```
 * 
 * This Pattern is Best Practice:
 * ✅ Type-safe config (TypeScript knows all properties)
 * ✅ Fail early (startup fails if config invalid)
 * ✅ Self-documenting (each var has JSDoc)
 * ✅ Runtime validation (catches .env typos)
 * ✅ Defaults provided (no undefined surprises)
 * 
 * Development vs Production:
 * - Dev: verbose logs, defaults allow local testing
 * - Prod: enforce strong requirements (SERVICE_TOKEN_SECRET, etc)
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// ===== Load .env File =====
// Reads .env from project root before process.env is used
// If file not found: warning logged, continues with process.env
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

// ===== Load Google Sheets Credentials =====
// If GOOGLE_CREDENTIALS_JSON_FILE points to file: read and load into process.env
// Allows storing sensitive credentials in file instead of environment variable
if (process.env.GOOGLE_CREDENTIALS_JSON_FILE && !process.env.GOOGLE_CREDENTIALS_JSON) {
  try {
    const credFilePath = resolve(process.cwd(), process.env.GOOGLE_CREDENTIALS_JSON_FILE);
    const credFileContent = readFileSync(credFilePath, 'utf-8');
    process.env.GOOGLE_CREDENTIALS_JSON = credFileContent;
  } catch (error) {
    console.warn(`⚠️ Không thể đọc file credentials: ${process.env.GOOGLE_CREDENTIALS_JSON_FILE}`);
  }
}

// ===== Helper Functions =====

/**
 * Check if string starts with any of the allowed prefixes
 * Example: hasAllowedPrefix('postgresql://...', ['postgresql://', 'mysql://']) → true
 */
const hasAllowedPrefix = (value: string, prefixes: string[]): boolean =>
  prefixes.some(prefix => value.startsWith(prefix));

/**
 * Format URL endpoint for safe display (hide credentials)
 * Example: postgresql://user:pass@host:5432/db → postgresql://host:5432/db
 */
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

// ===== ZOD SCHEMA DEFINITION =====
// Defines all environment variables with type, validation, and defaults

/**
 * Schema for Environment Variable Validation
 * ===========================================
 *
 * Order:
 * 1. z.object({...}) - define all variables and their schemas
 * 2. .superRefine(...) - custom validation rules
 * 
 * Variable Types:
 * - z.string() - required string
 * - z.string().optional() - optional string
 * - z.enum([...]) - must be one of: 'dev' | 'prod'
 * - z.coerce.number() - parse string as number
 * - .default('value') - use if not provided
 * - .refine(fn, 'msg') - custom validation function
 * - .min(1, 'msg') - string length validation
 */
const envSchema = z.object({
  // ===== Node.js & Express Configuration =====
  
  /**
   * NODE_ENV: Runtime environment
   * ==============================
   * Values: 'development' | 'staging' | 'production'
   * 
   * Affects:
   * - development: verbose logs, SQL queries logged
   * - production: minimal logs, Redis caching required
   * 
   * Default: 'development' (safe for local testing)
   */
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  /**
   * PORT: Express server listening port
   * ==================================
   * Type: number (z.coerce parses string → number)
   * Default: 8003
   * Examples: 3000, 8000, 8003, 5000
   */
  PORT: z.coerce.number().default(8003),

  /**
   * SERVICE_TOKEN_SECRET: HMAC signing key
   * ====================================
   * Purpose: Sign/verify X-Service-Token header for service-to-service auth
   * 
   * Token Flow:
   * 1. Service A generates token: HMAC-SHA256(payload, SECRET)
   * 2. Service A sends: X-Service-Token: service:timestamp:signature
   * 3. Logic Service verifies using same SECRET
   * 4. If hash matches: request is authenticated
   * 
   * Security Requirements:
   * - Development: optional (can use default)
   * - Production: required, min 16 characters (strong)
   * 
   * Format Examples:
   * - "my-super-secret-key-1234567890"
   * - "randomly-generated-secure-token"
   */
  SERVICE_TOKEN_SECRET: z.string().optional(),

  // ===== DATABASE (PostgreSQL) =====
  
  /**
   * DATABASE_URL: PostgreSQL connection string
   * =========================================
   * Required: yes
   * Format: postgresql://[user[:password]@]host[:port]/database
   * 
   * Examples:
   * - postgresql://soa:soa@localhost:5432/logic (local)
   * - postgresql://user:pass@db.prod.io:5432/db (production)
   * - postgresql://postgres@postgres:5432/postgres (Docker)
   * 
   * Connection Details Extracted:
   * - Host: database server address
   * - Port: 5432 (default PostgreSQL port)
   * - User/Password: authentication
   * - Database: which database to use
   * 
   * Prisma uses this to:
   * - Create connection pool (10 connections by default)
   * - Execute queries (prisma.user.findMany(), etc)
   * - Run migrations
   */
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL không thể trống')
    .refine(
      value => hasAllowedPrefix(value, ['postgresql://', 'mysql://']),
      'DATABASE_URL phải bắt đầu bằng postgresql:// hoặc mysql://'
    ),

  // ===== KAFKA MESSAGE BROKER =====
  
  /**
   * KAFKA_BROKER: Kafka broker address(es)
   * ==================================
   * Required: yes
   * Format: host:port or host1:port1,host2:port2 (cluster)
   * 
   * Examples:
   * - "localhost:9092" (single, local Docker)
   * - "kafka:9092" (internal Docker network)
   * - "kafka1:9092,kafka2:9092,kafka3:9092" (cluster)
   * - "kafka.prod.io:9092" (production)
   * 
   * Consumer/Producer use this to:
   * - Connect to broker
   * - Subscribe to topics
   * - Publish messages
   * - Auto-create topics (if enabled)
   */
  KAFKA_BROKER: z.string().min(1, 'KAFKA_BROKER không thể trống'),

  /**
   * KAFKA_USERNAME: Optional SASL authentication
   * ========================================
   * Required: only if Kafka requires auth
   * 
   * Used with: KAFKA_PASSWORD
   * Mechanism: PLAIN SASL (username + password)
   * 
   * If not provided: connects without authentication
   * (only works for open Kafka brokers)
   */
  KAFKA_USERNAME: z.string().optional(),

  /**
   * KAFKA_PASSWORD: Optional SASL password
   * ==================================
   * Required: only if Kafka requires auth
   * 
   * Used with: KAFKA_USERNAME
   * Secure: should be kept in secrets/vault
   */
  KAFKA_PASSWORD: z.string().optional(),

  // ===== REDIS CACHE =====
  
  /**
   * REDIS_URL: Redis cache connection string
   * ======================================
   * Required: yes
   * Format: redis://[:password@]host[:port]/[database]
   * 
   * Examples:
   * - "redis://localhost:6379/0" (local, db 0)
   * - "redis://:mypass@redis.io:6379/1" (with password, db 1)
   * - "redis://redis:6379/0" (Docker, internal network)
   * - "rediss://cache.prod.io:6380/0" (production, SSL)
   * 
   * Redis uses:
   * - Cache course context (24-hour TTL)
   * - Cache course statistics
   * - Session data (optional)
   * 
   * Performance: 10-50x faster than database for cached queries
   */
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL không thể trống')
    .refine(
      value => hasAllowedPrefix(value, ['redis://', 'rediss://']),
      'REDIS_URL phải bắt đầu bằng redis:// hoặc rediss://'
    ),

  // ===== GOOGLE SHEETS API (OPTIONAL) =====
  
  /**
   * GOOGLE_CREDENTIALS_JSON: Google Cloud service account credentials
   * ============================================================
   * Required: only if using Google Sheets integration
   * Format: JSON string (entire service account key as JSON)
   * 
   * How to get:
   * 1. Go to Google Cloud Console
   * 2. Create Service Account
   * 3. Create key → JSON
   * 4. Download JSON file
   * 5. Keep content secret (contains private key!)
   * 
   * Alternative to .env:
   * - Set GOOGLE_CREDENTIALS_JSON_FILE=/path/to/key.json
   * - Config will read file and load into GOOGLE_CREDENTIALS_JSON
   */
  GOOGLE_CREDENTIALS_JSON: z.string().optional(),

  /**
   * GOOGLE_SHEET_ID: ID of Google Sheet to sync
   * ========================================
   * Required: only if using Google Sheets integration
   * Format: long string of alphanumeric characters
   * 
   * Example: "1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T"
   * 
   * Found in: Google Sheet URL
   * URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
   */
  GOOGLE_SHEET_ID: z.string().optional(),

  // ===== LOGGING =====
  
  /**
   * LOG_LEVEL: Minimum log level to output
   * ==================================
   * Values: 'error' | 'warn' | 'info' | 'debug'
   * Severity: error < warn < info < debug
   * 
   * Example: LOG_LEVEL=info
   * - Shows: error, warn, info messages
   * - Hides: debug messages
   * 
   * Default: 'info' (balance of detail and noise)
   */
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  /**
   * LOG_TO_FILE: Write logs to file in addition to console
   * ================================================
   * Values: 'true' | 'false' (string, converted to boolean)
   * Default: 'false' (console only)
   * 
   * If true: logs written to logs/ directory
   * Useful: production troubleshooting, audit trails
   */
  LOG_TO_FILE: z.string().transform(val => val === 'true').default('false'),

  // ===== DISCORD INTEGRATION (OPTIONAL) =====
  
  /**
   * DISCORD_BOT_TOKEN: Discord bot authentication token
   * ================================================
   * Required: only if Logic Service talks directly to Discord
   * 
   * Note: Usually not needed here
   * - Discord Bot listens for student activities
   * - Bot publishes events to Kafka
   * - Logic Service receives via consumer
   * - No direct Discord communication needed
   */
  DISCORD_BOT_TOKEN: z.string().optional(),

  // ===== MINIO / FILE STORAGE (OPTIONAL) =====
  
  /**
   * MINIO_ENDPOINT: MinIO (S3-compatible) server address
   * ================================================
   * Required: only if backing up files to object storage
   * Format: http://host:port or https://host:port
   * 
   * Examples:
   * - "http://localhost:9000" (local)
   * - "https://minio.prod.io" (production)
   * 
   * MinIO uses:
   * - Backup student uploads (PDFs, documents)
   * - Long-term storage outside Discord
   */
  MINIO_ENDPOINT: z
    .string()
    .refine(
      value => hasAllowedPrefix(value, ['http://', 'https://']),
      'MINIO_ENDPOINT phải bắt đầu bằng http:// hoặc https://'
    )
    .optional(),

  /**
   * MINIO_ACCESS_KEY: MinIO authentication key
   * =========================================
   * Required: only if using MinIO
   * Similar to AWS access key
   */
  MINIO_ACCESS_KEY: z.string().optional(),

  /**
   * MINIO_SECRET_KEY: MinIO secret password
   * ====================================
   * Required: only if using MinIO
   * Similar to AWS secret key
   * Keep secret!
   */
  MINIO_SECRET_KEY: z.string().optional(),

  /**
   * MINIO_BUCKET: MinIO bucket name (like S3 bucket)
   * ============================================
   * Required: only if using MinIO
   * Example: "logic-service-files", "uploads", "documents"
   */
  MINIO_BUCKET: z.string().optional(),
}).superRefine((data, ctx) => {
  // ===== Custom Validation Logic =====
  // Checks that depend on other variables or complex logic
  
  const token = data.SERVICE_TOKEN_SECRET?.trim();

  // Production-specific requirements
  if (data.NODE_ENV === 'production') {
    // SERVICE_TOKEN_SECRET is required in production
    if (!token) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SERVICE_TOKEN_SECRET'],
        message: 'SERVICE_TOKEN_SECRET là bắt buộc khi NODE_ENV=production',
      });
      return;
    }

    // Must be strong (min 16 chars) in production
    if (token.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SERVICE_TOKEN_SECRET'],
        message: 'SERVICE_TOKEN_SECRET phải có ít nhất 16 ký tự khi NODE_ENV=production',
      });
    }
    return;
  }

  // Development: if provided, should be min 16 chars
  if (token && token.length < 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SERVICE_TOKEN_SECRET'],
      message: 'SERVICE_TOKEN_SECRET nếu được cấu hình thì phải có ít nhất 16 ký tự',
    });
  }
});

// ===== PARSE & VALIDATE ENVIRONMENT =====

/**
 * Parse and Validate All Environment Variables
 * ==========================================
 * 
 * Zod.parse() will:
 * 1. Check required variables exist
 * 2. Validate types (coerce string → number if needed)
 * 3. Apply custom validation rules
 * 4. Set defaults
 * 5. Throw ZodError if validation fails
 */
let parsedEnv: z.infer<typeof envSchema>;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  // If validation fails: print all errors and exit immediately
  // This prevents startup with invalid configuration
  if (error instanceof z.ZodError) {
    console.error('❌ Environment validation error:');
    error.errors.forEach(err => {
      const path = err.path.join('.');
      console.error(`  • ${path}: ${err.message}`);
    });
    process.exit(1);  // Halt immediately with error code 1
  }
  throw error;
}

// ===== EXPORT FINAL CONFIG OBJECT =====

/**
 * Config Object - Central Configuration
 * ===================================
 * 
 * Exported as `config` constant
 * Type-safe: TypeScript knows all properties
 * Validated: Zod guaranteed all values correct
 * 
 * Usage throughout codebase:
 * ```typescript
 * import { config } from '../config/env';
 * 
 * const port = config.port;  // 8003
 * const db = config.databaseUrl;  // postgresql://...
 * const isDev = config.isDev;  // boolean
 * 
 * if (config.isProd) {
 *   // production-specific code
 * }
 * ```
 */
export const config = {
  // Environment flags (convenience computed properties)
  nodeEnv: parsedEnv.NODE_ENV,
  isDev: parsedEnv.NODE_ENV === 'development',
  isProd: parsedEnv.NODE_ENV === 'production',
  
  // Server
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

  // Google Sheets (optional)
  googleCredentialsJson: parsedEnv.GOOGLE_CREDENTIALS_JSON,
  googleSheetId: parsedEnv.GOOGLE_SHEET_ID,

  // Logging
  logLevel: parsedEnv.LOG_LEVEL,
  logToFile: parsedEnv.LOG_TO_FILE,

  // Discord (optional)
  discordBotToken: parsedEnv.DISCORD_BOT_TOKEN,

  // MinIO (optional)
  minioEndpoint: parsedEnv.MINIO_ENDPOINT,
  minioAccessKey: parsedEnv.MINIO_ACCESS_KEY,
  minioSecretKey: parsedEnv.MINIO_SECRET_KEY,
  minioBucket: parsedEnv.MINIO_BUCKET,
} as const;  // as const = all properties are readonly (immutable)

// ===== TYPE EXPORT =====

/**
 * Config Type for TypeScript
 * =========================
 * Allows type annotations:
 * 
 * ```typescript
 * function initDatabase(config: Config) {
 *    // config is type-safe here
 * }
 * ```
 */
export type Config = typeof config;

// ===== DEBUG LOGGING (DEVELOPMENT ONLY) =====

/**
 * Print Configuration Summary in Development
 * ========================================
 * Shows:
 * - Environment name
 * - Port
 * - Database (endpoint only, no credentials)
 * - Kafka broker
 * - Redis (endpoint only, no credentials)
 * - Warnings (SERVICE_TOKEN_SECRET not set in dev)
 */
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
