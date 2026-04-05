import { Request, Response, NextFunction } from 'express';
import { APIResponse } from '../types';
import { LogicServiceError } from '../types';
import { config } from '../config/env';

export const errorHandler = (
  err: Error | LogicServiceError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An error occurred';
  let details: string | undefined;

  if (err instanceof LogicServiceError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }

  else if (err instanceof SyntaxError) {
    statusCode = 400;
    code = 'INVALID_REQUEST';
    message = 'Request format is invalid';
  }

  else {
    statusCode = 500;
    code = 'INTERNAL_ERROR';
    message = 'Internal server error';
    details = err.message;
  }

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

  const response: APIResponse = {
    success: false,
    statusCode,
    message,
    error: {
      code,

      details: config.nodeEnv === 'development' ? details : undefined,
    },
  };

  res.status(statusCode).json(response);
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {

    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

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
