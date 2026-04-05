/**
 * Express App Configuration & Middleware Setup
 * =============================================
 * 
 * Mục đích:
 * - Khởi tạo Express app instance
 * - Đăng ký middleware (auth, parsing, logging)
 * - Mount route handlers
 * - Setup error handling
 * 
 * Middleware Pipeline:
 * 1. express.json() - Parse JSON body
 * 2. express.urlencoded() - Parse form data
 * 3. Request logging (dev only)
 * 4. Auth middleware - Check X-Service-Token
 * 5. Route handlers - Business logic
 * 6. Error handler - Catch & format errors
 * 
 * Route Structure:
 * ├─ /health           (public, no auth)
 * │  ├─ GET /health
 * │  ├─ GET /health/ready
 * │  └─ GET /health/live
 * ├─ /v1               (protected, auth required)
 * │  ├─ /users         (user management)
 * │  ├─ /courses       (course management)
 * │  └─ /grades        (grade management)
 * 
 * Setup in index.ts:
 * import app from './app';
 * app.listen(3000);
 * 
 * Dùng bởi: index.ts (server entry point)
 */

import express, { Request, Response } from 'express';
import { authMiddleware, skipAuth } from './middlewares/auth';
import { errorHandler } from './middlewares/errorHandler';
import { config } from './config/env';

/**
 * ===== Import Route Handlers =====
 * Each router handles specific domain (users, courses, grades, etc)
 */
import healthRoutes from './routes/health';
import usersRoutes from './routes/users';
import coursesRoutes from './routes/courses';
import gradesRoutes from './routes/grades';

/**
 * ===== Create Express App Instance =====
 */
const app = express();

/**
 * ===== MIDDLEWARE SETUP =====
 * Order matters! Middleware is executed in registration order.
 */

/**
 * Step 1: Parse Request Bodies
 * ============================
 */

/**
 * Parse JSON request body
 * limit: 10MB (max request size)
 * Populates req.body for JSON requests
 */
app.use(express.json({ limit: '10mb' }));

/**
 * Parse URL-encoded form data
 * extended: true allows nested objects
 * Handles application/x-www-form-urlencoded
 */
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Step 2: Request Logging (Development Only)
 * ===========================================
 */
if (config.nodeEnv === 'development') {
  app.use((req: Request, _res: Response, next) => {
    console.log(`📨 ${req.method} ${req.path}`);
    next();
  });
}

/**
 * Step 3: Route Mounting
 * ======================
 */

/**
 * Public Routes - No Authentication Required
 * ===========================================
 * /health - Health check endpoints
 * - Used by Kubernetes, Docker, load balancers
 * - No X-Service-Token needed
 * - skipAuth: mark request as authenticated (for errorHandler)
 */
app.use('/health', skipAuth, healthRoutes);

/**
 * Protected Routes - Authentication Required
 * ===========================================
 * All /v1/* routes require X-Service-Token header
 * 
 * authMiddleware will:
 * 1. Extract X-Service-Token header
 * 2. Validate signature and timestamp
 * 3. Set req.service, req.isInternal
 * 4. Pass to next middleware/handler
 * 
 * Caller must send:
 * X-Service-Token: {service}:{timestamp}:{signature}
 */
app.use('/v1', authMiddleware);

/**
 * Route Handlers for /v1/* endpoints
 * Order doesn't matter (all protected by authMiddleware above)
 */
app.use('/v1/users', usersRoutes); // User management (CRUD)
app.use('/v1/courses', coursesRoutes); // Course management
app.use('/v1/grades', gradesRoutes); // Grade/scoring management

/**
 * Step 4: Error Handling
 * ======================
 * IMPORTANT: Error handlers MUST be registered last
 * They catch errors from all previous middleware & routes
 */

/**
 * Global Error Handler
 * ===================
 * Catches all errors from route handlers
 * Formats response in standard error format
 * Returns appropriate HTTP status codes
 */
app.use(errorHandler);

/**
 * Export Express App
 * ==================
 * Used by index.ts to start server
 */
export default app;
