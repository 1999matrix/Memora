import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-correlation-id'];
  const id =
    typeof incoming === 'string' && incoming.trim()
      ? incoming.trim()
      : randomUUID();
  req.headers['x-correlation-id'] = id;
  res.setHeader('x-correlation-id', id);
  res.locals.correlationId = id;
  next();
}
