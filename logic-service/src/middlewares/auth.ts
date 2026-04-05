/**
 * Authentication Middleware - Service-to-Service Authentication
 * ==============================================================
 * 
 * Mục đích:
 * - Xác thực inter-service communication (Discord Proxy, Web Service, etc)
 * - Sử dụng HMAC-SHA256 token signing
 * - Ngăn chặn unauthorized requests từ external clients
 * 
 * Token Format:
 * X-Service-Token: {service}:{timestamp}:{signature}
 * 
 * Example:
 * X-Service-Token: discord-proxy:1705302000000:a1b2c3d4e5f6...
 * 
 * Signature Generation (from caller service):
 * 1. Create message: "{service}:{timestamp}"
 * 2. Compute: HMAC-SHA256(message, SERVICE_TOKEN_SECRET)
 * 3. Return hex digest
 * 
 * Signature Verification (this middleware):
 * 1. Extract: service, timestamp, signature from token
 * 2. Recompute: HMAC-SHA256("{service}:{timestamp}", SECRET)
 * 3. Compare: computed signature === provided signature
 * 4. Check: timestamp not older than 5 minutes
 * 
 * Security:
 * - Token is time-bound (5 min expiry)
 * - Cryptographic signature prevents tampering
 * - SERVICE_TOKEN_SECRET should be >32 chars, rotated quarterly
 * - Never log tokens in production
 * 
 * Usage in Routes:
 * // Protect route with auth
 * router.post('/grades', authMiddleware, handleCreateGrade);
 * 
 * // Skip auth for public endpoints
 * router.get('/health', skipAuth, getHealth);
 */

import { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { config } from '../config/env';
import { UnauthorizedError } from '../types';

/**
 * Extend Express Request Type
 * Adds properties for authenticated requests
 */
declare global {
  namespace Express {
    interface Request {
      service?: string; // Service name (e.g., "discord-proxy")
      userId?: string; // User ID (optional, extracted from token/body)
      isInternal?: boolean; // Flag: is authenticated?
    }
  }
}

/**
 * AuthMiddleware - Verify X-Service-Token Header
 * ==============================================
 * 
 * Workflow:
 * 1. Extract X-Service-Token from request headers
 * 2. Parse: service, timestamp, signature
 * 3. Validate timestamp (not older than 5 minutes)
 * 4. Compute expected signature using SERVICE_TOKEN_SECRET
 * 5. Compare signatures (constant-time comparison)
 * 6. If valid: set req.service, req.isInternal, call next()
 * 7. If invalid/missing: return 401 Unauthorized
 * 
 * @throws UnauthorizedError - Token missing, invalid, expired, or signature mismatch
 * @throws Error - CONFIG_ERROR if SERVICE_TOKEN_SECRET not set
 * 
 * @example
 * // In app.ts:
 * app.use(authMiddleware); // Apply to all routes
 * 
 * // In route:
 * router.post('/grades', authMiddleware, handleGrades);
 * // Discord Proxy will send:
 * // POST /v1/grades
 * // X-Service-Token: discord-proxy:1705302000000:abc123...
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // ===== Step 1: Extract Token Header =====
    const token = req.headers['x-service-token'] as string;

    if (!token) {
      throw new UnauthorizedError(
        'X-Service-Token header is required'
      );
    }

    // ===== Step 2: Parse Token =====
    // Format: service:timestamp:signature
    const parts = token.split(':');
    if (parts.length !== 3) {
      throw new UnauthorizedError('X-Service-Token format is invalid. Expected: service:timestamp:signature');
    }

    const [service, timestamp, signature] = parts;

    // ===== Step 3: Validate Timestamp =====
    // Ensure token was created recently (max 5 minutes ago)
    const tokenTime = parseInt(timestamp, 10);
    if (isNaN(tokenTime)) {
      throw new UnauthorizedError('X-Service-Token timestamp is invalid');
    }

    const now = Date.now();
    const age = now - tokenTime;
    const maxAge = 5 * 60 * 1000; // 5 minutes = 300,000 milliseconds

    if (age > maxAge) {
      throw new UnauthorizedError(`X-Service-Token expired (${(age / 1000).toFixed(0)}s old)`);
    }

    // ===== Step 4: Verify Signature =====
    // Recompute HMAC signature and compare
    if (!config.serviceTokenSecret) {
      throw new Error('❌ CONFIG: serviceTokenSecret not configured. Set SERVICE_TOKEN_SECRET env var');
    }

    const message = `${service}:${timestamp}`;
    const expectedSignature = createHmac('sha256', config.serviceTokenSecret)
      .update(message)
      .digest('hex');

    // Constant-time comparison (prevent timing attacks)
    if (signature !== expectedSignature) {
      throw new UnauthorizedError('X-Service-Token signature is invalid');
    }

    // ===== Step 5: Valid Token - Set Request Properties =====
    // Mark request as authenticated
    req.service = service; // Store which service made this request
    req.isInternal = true; // Flag for downstream middleware

    // ===== Step 6: Extract Optional User ID =====
    // Caller may provide userId in query or body
    const userId = (req.query.userId as string) || (req.body?.userId as string);
    if (userId) {
      req.userId = userId; // Store for downstream handlers
    }

    console.log(`✅ Auth success: service=${service}, userId=${userId || 'none'}`);
    next();
  } catch (error) {
    // ===== Error Handling =====
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

/**
 * Skip Auth Middleware
 * ===================
 * 
 * Use for public endpoints that don't need auth
 * (health checks, public API endpoints, etc)
 * 
 * @example
 * // Public health check - no auth needed
 * router.get('/health', skipAuth, getHealth);
 * 
 * // Protected endpoint - auth required
 * router.post('/grades', requireAuth, createGrade);
 */
export const skipAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Mark as "internal" to satisfy requireAuth checks
  req.isInternal = true;
  next();
};

/**
 * Require Auth Middleware
 * ======================
 * 
 * Guard middleware: reject unauthenticated requests
 * Use on protected routes that require valid token
 * 
 * @throws 401 Unauthorized - if req.isInternal !== true
 * 
 * @example
 * // Protect route - only authenticated services can call
 * router.post('/grades', requireAuth, createGrade);
 * 
 * // If no auth applied earlier, will reject with 401
 */
export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Check if upstream middleware set isInternal flag
  if (!req.isInternal) {
    console.warn('❌ Access denied: request is not authenticated');
    _res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Authentication required', // "Yêu cầu xác thực" in Vietnamese
      error: { code: 'UNAUTHORIZED' },
    });
    return;
  }

  next(); // Request is authenticated, proceed
};
