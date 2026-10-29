import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import type { AppContainer } from './lib/container.js';
import { correlationId } from './http/middleware/correlation-id.js';
import { errorHandler } from './http/middleware/error-handler.js';
import { redisRateLimit } from './lib/redis-rate-limit.js';
import { jsonEnvelope } from './http/middleware/wrap-response.js';
import { registerRoutes } from './http/routes.js';
import { mountSwagger } from './http/swagger.js';

export function createApp(container: AppContainer) {
  const app = express();

  app.use(
    pinoHttp({
      redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
    }),
  );
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: true, credentials: true }));
  app.use(correlationId);
  app.use(
    redisRateLimit(container.redis, {
      prefix: 'global',
      windowMs: 60_000,
      limit: 100,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(jsonEnvelope);
  mountSwagger(app, container.config);
  app.use(registerRoutes(container));
  app.use(errorHandler);

  return app;
}
