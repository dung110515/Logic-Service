/**
 * Express App Configuration
 * Thiết lập routes, middleware, error handlers
 */

import express, { Request, Response } from 'express';
import { authMiddleware, skipAuth } from './middlewares/auth';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { config } from './config/env';

// ===== Import Routes =====
import healthRoutes from './routes/health';
import usersRoutes from './routes/users';
import coursesRoutes from './routes/courses';
import gradesRoutes from './routes/grades';

const app = express();

// ===== Middleware =====

/**
 * Parse JSON request body
 * Max size: 10MB (configured in constants.API_CONFIG)
 */
app.use(express.json({ limit: '10mb' }));

/**
 * Parse URL-encoded request body
 */
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Request logging (development only)
 */
if (config.NODE_ENV === 'development') {
  app.use((req: Request, res: Response, next) => {
    console.log(`📨 ${req.method} ${req.path}`);
    next();
  });
}

// ===== Public Routes (no auth required) =====
app.use('/health', skipAuth, healthRoutes);

// ===== Protected Routes (require auth) =====
/**
 * Áp dụng auth middleware cho tất cả routes /v1/*
 * Các route handler phải gửi X-Service-Token header
 */
app.use('/v1', authMiddleware);

/**
 * REST API v1 routes
 */
app.use('/v1/users', usersRoutes);
app.use('/v1/courses', coursesRoutes);
app.use('/v1/grades', gradesRoutes);

// ===== Error Handling =====

/**
 * 404 Not Found handler
 * Phải được đặt sau tất cả route definitions
 */
app.use(notFoundHandler);

/**
 * Global error handler
 * Phải được đặt cuối cùng
 */
app.use(errorHandler);

export default app;
