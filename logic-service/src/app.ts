import express, { Request, Response } from 'express';
import { authMiddleware, skipAuth } from './middlewares/auth';
import { errorHandler } from './middlewares/errorHandler';
import { config } from './config/env';

import healthRoutes from './routes/health';
import usersRoutes from './routes/users';
import coursesRoutes from './routes/courses';
import gradesRoutes from './routes/grades';

const app = express();

app.use(express.json({ limit: '10mb' }));

app.use(express.urlencoded({ limit: '10mb', extended: true }));

if (config.nodeEnv === 'development') {
  app.use((req: Request, _res: Response, next) => {
    console.log(`📨 ${req.method} ${req.path}`);
    next();
  });
}

app.use('/health', skipAuth, healthRoutes);

app.use('/v1', authMiddleware);

app.use('/v1/users', usersRoutes);
app.use('/v1/courses', coursesRoutes);
app.use('/v1/grades', gradesRoutes);

app.use(errorHandler);

export default app;
