import { HttpException } from '../../lib/http-errors.js';
import type { NextFunction, Request, Response } from 'express';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status =
    err instanceof HttpException ? err.getStatus() : 500;

  let message: string | string[] = 'Internal Server Error';

  if (err instanceof HttpException) {
    const body = err.getResponse();
    if (typeof body === 'string') message = body;
    else if (typeof body === 'object' && body && 'message' in body) {
      message = (body as { message: string | string[] }).message;
    }
  } else if (process.env.NODE_ENV !== 'production' && err instanceof Error) {
    message = err.message;
  }

  res.status(status).json({
    success: false,
    statusCode: status,
    path: req.url,
    timestamp: new Date().toISOString(),
    message,
  });
}
