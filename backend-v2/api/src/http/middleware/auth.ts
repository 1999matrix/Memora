import { UnauthorizedException } from '../../lib/http-errors.js';
import type { NextFunction, Request, Response } from 'express';

import type { AuthUser, JwtPayload } from '../../domain/common/interfaces/jwt-payload.interface.js';
import { toSafeUser } from '../../domain/common/utils/user.util.js';
import type { AppContainer } from '../../lib/container.js';
import { JwtService } from '../../lib/jwt-service.js';

const jwt = new JwtService();

export type AuthedRequest = Request & { user?: AuthUser };

export function requireAuth(container: AppContainer) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new UnauthorizedException('Missing bearer token'));
      return;
    }
    const token = header.slice(7);
    try {
      const payload = await jwt.verifyAsync<JwtPayload>(token, {
        secret: container.config.getOrThrow<string>('jwt.accessSecret'),
      });
      const user = await container.users.findById(payload.sub);
      if (!user.isActive) {
        next(new UnauthorizedException('Account is inactive'));
        return;
      }
      req.user = toSafeUser(user);
      next();
    } catch {
      next(new UnauthorizedException('Invalid token'));
    }
  };
}

export function requireSuperAdmin(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  if (req.user?.role !== 'SUPER_ADMIN') {
    next(new UnauthorizedException('Forbidden'));
    return;
  }
  next();
}
