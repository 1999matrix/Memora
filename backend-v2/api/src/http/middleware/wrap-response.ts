import type { NextFunction, Request, Response } from 'express';

export function jsonEnvelope(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const skip = res.locals.skipResponseWrap === true;
  if (skip) {
    next();
    return;
  }

  const original = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.locals.skipResponseWrap) {
      return original(body);
    }
    return original({ success: true, data: body });
  };
  next();
}
