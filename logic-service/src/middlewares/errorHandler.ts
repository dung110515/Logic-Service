/**
 * Global Error Handler Middleware
 * Bắt tất cả error từ các handler và trả về response lỗi chuẩn
 */

import { Request, Response, NextFunction } from 'express';
import { APIResponse } from '../types';
import { LogicServiceError } from '../types';
import { config } from '../config/env';

/**
 * Global error handler middleware
 * Phải được đăng ký cuối cùng trong app.use()
 * 
 * Workflow:
 * 1. Catch error từ tất cả route handlers
 * 2. Log error (file hoặc console)
 * 3. Format response lỗi chuẩn
 * 4. Trả về HTTP status code phù hợp
 */
export const errorHandler = (
  err: Error | LogicServiceError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // ===== Xác định loại lỗi =====
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Có lỗi xảy ra';
  let details: string | undefined;

  if (err instanceof LogicServiceError) {
    // Lỗi từ Logic Service (ValidationError, NotFoundError, etc.)
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof SyntaxError) {
    // JSON parse error, etc.
    statusCode = 400;
    code = 'INVALID_REQUEST';
    message = 'Yêu cầu không hợp lệ';
  } else {
    // Generic error
    statusCode = 500;
    code = 'INTERNAL_ERROR';
    message = 'Có lỗi xảy ra trên server';
    details = err.message;
  }

  // ===== Logging =====
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  const logMessage = `[${statusCode}] ${code}: ${message}`;

  if (logLevel === 'error') {
    console.error(logMessage, {
      code,
      statusCode,
      message,
      details,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
    });
  } else {
    console.warn(logMessage, { code, statusCode });
  }

  // ===== Response Format =====
  const response: APIResponse = {
    success: false,
    statusCode,
    message,
    error: {
      code,
      details: config.nodeEnv === 'development' ? details : undefined,
    },
  };

  // ===== Gửi Response =====
  res.status(statusCode).json(response);
};

/**
 * Middleware để bắt async handler errors
 * Dùng với express async handlers
 *
 * Ví dụ:
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.findAll();
 *   res.json(users);
 * }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
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
