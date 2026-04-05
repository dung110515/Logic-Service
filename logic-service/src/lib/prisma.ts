/**
 * Prisma Client Initialization
 * ============================
 * 
 * Mục đích:
 * - Initialize and export single Prisma client instance
 * - Avoid multiple client instances (connection pool waste)
 * - Provide database access to all routes/handlers
 * 
 * Prisma Roles:
 * - Generates TypeScript types for database tables
 * - Provides type-safe query builder
 * - Auto-formats SQL queries
 * - Handles migrations (schema.prisma)
 * - Connection pooling to PostgreSQL
 * 
 * Database Access Flow:
 * 
 * Handler Code
 *     │
 *     └─ import prisma from '../lib/prisma'
 *        │
 *        ├─ prisma.user.findUnique({where: {id: "123"}})
 *        │  └─ TypeScript compiled to SQL
 *        │     └─ Sent to PostgreSQL
 *        │        └─ Result deserialized back to TypeScript object
 *        │
 *        └─ prisma.grade.create({data: {...}})
 *           └─ Returns new record with full types
 * 
 * Examples in Codebase:
 * - grades.ts: prisma.grade.findMany(), prisma.grade.create()
 * - courses.ts: prisma.course.findUnique(), prisma.course.delete()
 * - submissionHandler: prisma.submission.create()
 *
 * Database Schema Tables:
 * - User (students, instructors, admins)
 * - Course (courses + enrollments)
 * - Assignment (assignments per course)
 * - Submission (student submissions)
 * - Grade (grades for submissions)
 * - Ticket (Q&A questions)
 * - Document (uploaded PDFs, summaries)
 * 
 * See: prisma/schema.prisma for full schema
 */

import { PrismaClient } from '@prisma/client';

/**
 * Global Prisma Client Singleton
 * ==============================
 * 
 * Why singleton pattern?
 * - Database connections are expensive
 * - Each PrismaClient → 10 connections to PostgreSQL
 * - Multiple clients → Connection pool exhaustion → "too many connections" error
 * - Singleton ensures: 1 client = 1 connection pool (10 connections reused)
 * 
 * Pattern:
 * 1. Store client in globalThis (Node.js global object)
 * 2. Check if exists: reuse it
 * 3. If not: create new instance
 * 4. Return same instance across all imports
 * 
 * This is TypeScript's recommended Prisma pattern
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Create or Get Prisma Client
 * ===========================
 * 
 * Step 1: Check globalForPrisma.prisma exists
 *    If yes: return cached instance
 *    If no: create new PrismaClient
 * 
 * Step 2: Configure logging
 *    log: ['query'] = log all SQL queries to console
 *    Useful in development for debugging
 *    (disabled in production for performance)
 * 
 * Step 3: Store in global (except production)
 *    In development: save to globalThis for HMR (hot reload)
 *    In production: don't need hot reload, just use instance
 * 
 * @example
 * // In any file:
 * import prisma from '../lib/prisma';
 * 
 * const users = await prisma.user.findMany();
 * const grade = await prisma.grade.create({
 *   data: {submissionId, score, comment, gradedById}
 * });
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query'],  // Log all SQL queries in development
  });

/**
 * Hot Module Replacement (HMR)
 * ===========================
 * 
 * In development: save client to global
 * - Allows Next.js/Nuxt hot reload without DB disconnect
 * - When code changes: new module reuses same DB client
 * - No connection drop = faster development
 * 
 * In production: don't store in global
 * - Production doesn't use hot reload
 * - Simpler/cleaner (one instance per process)
 */
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Export Default
 * ==============
 * Allows:
 * import prisma from '../lib/prisma'  ← Default export
 * 
 * Also exported as named export:
 * import { prisma } from '../lib/prisma'  ← Named export
 */
export default prisma;
