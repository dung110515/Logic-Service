/**
 * Global Error Handler Middleware
 * ================================
 * 
 * Mục đích:
 * - Centralized error handling cho toàn bộ ứng dụng
 * - Bắt mọi uncaught errors từ route handlers
 * - Format responses thành error format chuẩn
 * - Log errors với level phù hợp (info, warn, error)
 * 
 * Error Flow:
 * Route Handler
 *   ├─ Success: res.json(data)
 *   ├─ Throws Error
 *       └─ Passed to errorHandler middleware
 *           ├─ Categorize error type
 *           ├─ Log error
 *           └─ Return standardized error response
 * 
 * Error Types Handled:
 * 1. LogicServiceError subclasses (custom errors)
 *    - ValidationError (400)
 *    - NotFoundError (404)
 *    - UnauthorizedError (401)
 *    - Any error with statusCode property
 * 
 * 2. Built-in Error types
 *    - SyntaxError (400 - bad JSON)
 *    - ReferenceError (500)
 *    - Generic Error (500)
 * 
 * Response Format:
 * {
 *   "success": false,
 *   "statusCode": 400,
 *   "message": "User not found",
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "details": "userId=123 does not exist"  (dev only)
 *   }
 * }
 * 
 * Setup in app.ts:
 * // Register all other middleware & routes FIRST
 * app.use(authMiddleware);
 * app.use(routes);
 * 
 * // Register error handler LAST
 * app.use(errorHandler);
 * 
 * Dùng bởi: Express app (global error handling)
 */

import { Request, Response, NextFunction } from 'express';
import { APIResponse } from '../types';
import { LogicServiceError } from '../types';
import { config } from '../config/env';

/**
 * Global Error Handler Middleware
 * ===============================
 * 
 * Express error handler signature:
 * (err, req, res, next) => {...}
 * 
 * This handler:
 * 1. Catches errors thrown by route handlers
 * 2. Categorizes error type (custom, built-in, generic)
 * 3. Determines HTTP status code
 * 4. Logs error with appropriate level
 * 5. Returns standardized error response
 * 
 * IMPORTANT: Must be registered LAST in app.use() chain
 * to catch errors from previous middleware/routes
 * 
 * @param err - The error object (any type)
 * @param _req - Request object (unused)
 * @param res - Response object
 * @param _next - Next function (unused)
 * 
 * @example
 * // In app.ts:
 * import { errorHandler } from './middlewares/errorHandler';
 * 
 * app.use('/api', apiRoutes);
 * app.use(errorHandler); // Last!
 */
export const errorHandler = (
  err: Error | LogicServiceError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // ===== Step 1: Categorize Error =====
  // Determine statusCode, error code, and message based on error type
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An error occurred';
  let details: string | undefined;

  // ===== Custom Application Errors =====
  // LogicServiceError: custom errors with statusCode property
  // Examples: ValidationError(400), NotFoundError(404), UnauthorizedError(401)
  if (err instanceof LogicServiceError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details; // Additional context
  }
  // ===== Built-in JavaScript Errors =====
  // SyntaxError: malformed JSON, invalid syntax
  else if (err instanceof SyntaxError) {
    statusCode = 400;
    code = 'INVALID_REQUEST';
    message = 'Request format is invalid';
  }
  // ===== Generic Errors =====
  // ReferenceError, TypeError, unknown Error
  else {
    statusCode = 500;
    code = 'INTERNAL_ERROR';
    message = 'Internal server error';
    details = err.message; // Don't expose to client in production
  }

  // ===== Step 2: Log Error =====
  // Log level depends on HTTP status:
  // - 5xx errors → error level
  // - 4xx errors → warn level
  // - 3xx/2xx → should not reach here
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  const logMessage = `[${statusCode}] ${code}: ${message}`;

  if (logLevel === 'error') {
    // Server errors: log full stack trace (dev only)
    console.error(logMessage, {
      code,
      statusCode,
      message,
      details,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
    });
  } else {
    // Client errors: log basic info only
    console.warn(logMessage, { code, statusCode });
  }

  // ===== Step 3: Format Response =====
  // Standardized error response format (all errors should follow this)
  const response: APIResponse = {
    success: false,
    statusCode,
    message,
    error: {
      code,
      // Include details only in development (don't leak internals to clients)
      details: config.nodeEnv === 'development' ? details : undefined,
    },
  };

  // ===== Step 4: Send Response =====
  // Return error response with appropriate HTTP status code
  res.status(statusCode).json(response);
};

/**
 * Async Handler Wrapper
 * =====================
 * 
 * Express doesn't catch promise rejections from async handlers
 * This wrapper catches them and passes to errorHandler
 * 
 * Without wrapper:
 * router.get('/users', async (req, res) => {
 *   const users = await User.findAll(); // If rejects, error is unhandled!
 *   res.json(users);
 * });
 * 
 * With wrapper:
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.findAll(); // Rejection caught & sent to errorHandler
 *   res.json(users);
 * }));
 * 
 * Wrapper Flow:
 * 1. Return middleware function that wraps the original handler
 * 2. Wrap handler execution in Promise.resolve()
 * 3. Call .catch(next) to pass errors to error handler
 * 4. Express will invoke error handler with the rejected promise
 * 
 * @param fn - Async route handler function
 * @returns Express middleware that catches async errors
 * 
 * @example
 * // Async handler with error handling:
 * router.delete(
 *   '/users/:id',
 *   asyncHandler(async (req, res) => {
 *     const user = await User.findById(req.params.id);
 *     if (!user) throw new NotFoundError('User not found');
 *     await user.delete();
 *     res.json({ success: true });
 *     // Any errors thrown above are caught by asyncHandler
 *     // and passed to errorHandler middleware
 *   })
 * );
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // ===== Wrap Promise =====
    // Convert async function return to Promise (always a Promise)
    // Then catch any rejection and pass to next(error)
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Middleware để kiểm tra 404 (route not found)
 * Phải được dùng sau tất cả route definitions
 *
 * Ví dụ:
 * app.use(routes);
 * app.use(notFoundHandler);
 * app.use(errorHandler);
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const response: APIResponse = {
    success: false,
    statusCode: 404,
    message: `Đường dẫn ${req.method} ${req.path} không tìm thấy`,
    error: {
      code: 'NOT_FOUND',
    },
  };

  res.status(404).json(response);
};

/**
 * Helper: Tạo standardized error response
 * Dùng trong route handler để throw error
 *
 * Ví dụ:
 * throw new ValidationError('Email đã tồn tại', 'email must be unique');
 */
export const createErrorResponse = <T = any>(
  statusCode: number,
  message: string,
  code: string = 'ERROR',
  data?: T
): APIResponse<T> => {
  return {
    success: false,
    statusCode,
    message,
    error: {
      code,
    },
    data,
  };
};
