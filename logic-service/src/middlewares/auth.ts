import { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { config } from '../config/env';
import { UnauthorizedError } from '../types';

declare global {
  namespace Express {
    interface Request {
      service?: string;
      userId?: string;
      isInternal?: boolean;
    }
  }
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {

    const token = req.headers['x-service-token'] as string;

    if (!token) {
      throw new UnauthorizedError(
        'X-Service-Token header is required'
      );
    }

    const parts = token.split(':');
    if (parts.length !== 3) {
      throw new UnauthorizedError('X-Service-Token format is invalid. Expected: service:timestamp:signature');
    }

    const [service, timestamp, signature] = parts;

    const tokenTime = parseInt(timestamp, 10);
    if (isNaN(tokenTime)) {
      throw new UnauthorizedError('X-Service-Token timestamp is invalid');
    }

    const now = Date.now();
    const age = now - tokenTime;
    const maxAge = 5 * 60 * 1000;

    if (age > maxAge) {
      throw new UnauthorizedError(`X-Service-Token expired (${(age / 1000).toFixed(0)}s old)`);
    }

    if (!config.serviceTokenSecret) {
      throw new Error('❌ CONFIG: serviceTokenSecret not configured. Set SERVICE_TOKEN_SECRET env var');
    }

    const message = `${service}:${timestamp}`;
    const expectedSignature = createHmac('sha256', config.serviceTokenSecret)
      .update(message)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new UnauthorizedError('X-Service-Token signature is invalid');
    }

    req.service = service;
    req.isInternal = true;

    const userId = (req.query.userId as string) || (req.body?.userId as string);
    if (userId) {
      req.userId = userId;
    }

    console.log(`✅ Auth success: service=${service}, userId=${userId || 'none'}`);
    next();
  } catch (error) {

    if (error instanceof UnauthorizedError) {
      console.warn(`⚠️ Auth failed: ${error.message}`);
      res.status(401).json({
        success: false,
        statusCode: 401,
        message: error.message,
        error: { code: error.code },
      });
    } else {
      console.error(`❌ Auth error: ${error}`);
      res.status(500).json({
        success: false,
        statusCode: 500,
        message: 'Internal server error',
        error: { code: 'INTERNAL_ERROR' },
      });
    }
  }
};

export const skipAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {

  req.isInternal = true;
  next();
};

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {

  if (!req.isInternal) {
    console.warn('❌ Access denied: request is not authenticated');
    _res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Authentication required',
      error: { code: 'UNAUTHORIZED' },
    });
    return;
  }

  next();
};
