/**
 * Authentication Middleware
 * Xác thực X-Service-Token từ các service khác
 */

import { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { config } from '../config/env';
import { UnauthorizedError } from '../types';

/**
 * Extend Express Request type để có properties auth
 */
declare global {
  namespace Express {
    interface Request {
      service?: string;
      userId?: string;
      isInternal?: boolean;
    }
  }
}

/**
 * Xác thực X-Service-Token header
 * Token format: {service}:{timestamp}:{signature}
 * signature = HMAC-SHA256(service:timestamp, SECRET)
 *
 * Workflow:
 * 1. Lấy X-Service-Token từ header
 * 2. Parse service, timestamp, signature
 * 3. Compute lại signature dùng SERVICE_TOKEN_SECRET
 * 4. Compare với signature từ header
 * 5. Kiểm tra timestamp không quá cũ (~5 phút)
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.headers['x-service-token'] as string;

    // Nếu không có token
    if (!token) {
      throw new UnauthorizedError(
        'X-Service-Token header không tìm thấy'
      );
    }

    // Parse token: service:timestamp:signature
    const parts = token.split(':');
    if (parts.length !== 3) {
      throw new UnauthorizedError('X-Service-Token format không hợp lệ');
    }

    const [service, timestamp, signature] = parts;

    // ===== Kiểm tra timestamp =====
    const tokenTime = parseInt(timestamp, 10);
    if (isNaN(tokenTime)) {
      throw new UnauthorizedError('X-Service-Token timestamp không hợp lệ');
    }

    const now = Date.now();
    const age = now - tokenTime;
    const maxAge = 5 * 60 * 1000; // 5 phút

    if (age > maxAge) {
      throw new UnauthorizedError('X-Service-Token hết hạn');
    }

    // ===== Xác thực signature =====
    if (!config.serviceTokenSecret) {
      throw new Error('serviceTokenSecret không được cấu hình');
    }

    const message = `${service}:${timestamp}`;
    const expectedSignature = createHmac('sha256', config.serviceTokenSecret)
      .update(message)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new UnauthorizedError('X-Service-Token signature không hợp lệ');
    }

    // ===== Token hợp lệ - đặt request properties =====
    req.service = service;
    req.isInternal = true;

    // Optional: lấy userId từ query/body nếu cần
    const userId = (req.query.userId as string) || (req.body?.userId as string);
    if (userId) {
      req.userId = userId;
    }

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({
        success: false,
        statusCode: 401,
        message: error.message,
        error: { code: error.code },
      });
    } else {
      res.status(500).json({
        success: false,
        statusCode: 500,
        message: 'Internal server error',
        error: { code: 'INTERNAL_ERROR' },
      });
    }
  }
};

/**
 * Middleware để skip auth cho public endpoints (health check)
 * Dùng: router.get('/health', skipAuth, healthHandler)
 */
export const skipAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  req.isInternal = true; // Giả lập internal request
  next();
};

/**
 * Helper: Kiểm tra request có authentication hay không
 * Dùng để require auth cho protected routes
 */
export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.isInternal) {
    _res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Yêu cầu xác thực',
      error: { code: 'UNAUTHORIZED' },
    });
    return;
  }

  next();
};
