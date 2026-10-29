import { Router } from 'express';
import multer from 'multer';

import { LoginDto } from '../domain/modules/auth/dto/login.dto.js';
import { RegisterDto } from '../domain/modules/auth/dto/register.dto.js';
import { asyncHandler } from '../lib/async-handler.js';
import type { AppContainer } from '../lib/container.js';
import { validateBody } from '../lib/validate-dto.js';
import type { AuthedRequest } from './middleware/auth.js';
import { requireAuth, requireSuperAdmin } from './middleware/auth.js';
import { redisRateLimit } from '../lib/redis-rate-limit.js';

const upload = multer({ storage: multer.memoryStorage() });

function p(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function pageLimit(query: { page?: string; limit?: string }) {
  return {
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20,
  };
}

export function registerRoutes(container: AppContainer): Router {
  const api = Router();
  const auth = requireAuth(container);
  const authRateLimit = redisRateLimit(container.redis, {
    prefix: 'auth',
    windowMs: 60_000,
    limit: 20,
  });

  // --- Health (no /api/v1 prefix; mounted at app root) ---
  api.get(
    '/health',
    asyncHandler(async (_req, res) => {
      res.locals.skipResponseWrap = true;
      res.json(await container.health.check());
    }),
  );
  api.get('/health/live', (_req, res) => {
    res.locals.skipResponseWrap = true;
    res.json(container.health.live());
  });
  api.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      res.locals.skipResponseWrap = true;
      res.json(await container.health.ready());
    }),
  );

  const v1 = Router();

  // Auth (public)
  v1.post(
    '/auth/register',
    authRateLimit,
    validateBody(RegisterDto),
    asyncHandler(async (req, res) => {
      res.json(await container.auth.register(req.body));
    }),
  );
  v1.post(
    '/auth/login',
    authRateLimit,
    validateBody(LoginDto),
    asyncHandler(async (req, res) => {
      res.json(await container.auth.login(req.body));
    }),
  );
  v1.post(
    '/auth/refresh',
    asyncHandler(async (req, res) => {
      res.json(await container.auth.refresh(req.body.refreshToken));
    }),
  );
  v1.post(
    '/auth/logout',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.auth.logout(user.id));
    }),
  );
  v1.get(
    '/auth/me',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.auth.me(user.id));
    }),
  );

  v1.get(
    '/users/me',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.users.findSafeById(user.id));
    }),
  );
  v1.patch(
    '/users/me',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.users.updateMe(user.id, req.body));
    }),
  );
  v1.get(
    '/users/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.json(await container.users.findSafeById(p(req.params.id)));
    }),
  );

  v1.post(
    '/organizations',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.organizations.create(user.id, req.body));
    }),
  );
  v1.get(
    '/organizations',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      const { page, limit } = pageLimit(req.query as Record<string, string>);
      res.json(await container.organizations.findAllForUser(user.id, page, limit));
    }),
  );
  v1.get(
    '/organizations/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.organizations.findOne(user.id, p(req.params.id)));
    }),
  );
  v1.patch(
    '/organizations/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.organizations.update(user.id, p(req.params.id), req.body),
      );
    }),
  );
  v1.delete(
    '/organizations/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.organizations.remove(user.id, p(req.params.id)));
    }),
  );
  v1.get(
    '/organizations/:id/members',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.organizations.listMembers(user.id, p(req.params.id)));
    }),
  );
  v1.post(
    '/organizations/:id/members',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.organizations.addMember(user.id, p(req.params.id), req.body),
      );
    }),
  );
  v1.patch(
    '/organizations/:id/members/:userId',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.organizations.updateMember(
          user.id,
          p(req.params.id),
          p(req.params.userId),
          req.body,
        ),
      );
    }),
  );
  v1.delete(
    '/organizations/:id/members/:userId',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.organizations.removeMember(
          user.id,
          p(req.params.id),
          p(req.params.userId),
        ),
      );
    }),
  );

  v1.post(
    '/workspaces',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.workspaces.create(user.id, req.body));
    }),
  );
  v1.get(
    '/workspaces',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      const { page, limit } = pageLimit(req.query as Record<string, string>);
      res.json(await container.workspaces.findAllForUser(user.id, page, limit));
    }),
  );
  v1.get(
    '/workspaces/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.workspaces.findOne(user.id, p(req.params.id)));
    }),
  );
  v1.patch(
    '/workspaces/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.workspaces.update(user.id, p(req.params.id), req.body));
    }),
  );
  v1.delete(
    '/workspaces/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.workspaces.remove(user.id, p(req.params.id)));
    }),
  );
  v1.get(
    '/workspaces/:id/members',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.workspaces.listMembers(user.id, p(req.params.id)));
    }),
  );
  v1.post(
    '/workspaces/:id/members',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.workspaces.addMember(user.id, p(req.params.id), req.body),
      );
    }),
  );
  v1.patch(
    '/workspaces/:id/members/:userId',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.workspaces.updateMember(
          user.id,
          p(req.params.id),
          p(req.params.userId),
          req.body,
        ),
      );
    }),
  );
  v1.delete(
    '/workspaces/:id/members/:userId',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.workspaces.removeMember(
          user.id,
          p(req.params.id),
          p(req.params.userId),
        ),
      );
    }),
  );

  v1.post(
    '/workspaces/:workspaceId/documents',
    auth,
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.documents.upload(
          user.id,
          p(req.params.workspaceId),
          req.file as Express.Multer.File,
        ),
      );
    }),
  );
  v1.get(
    '/workspaces/:workspaceId/documents',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      const { page, limit } = pageLimit(req.query as Record<string, string>);
      res.json(
        await container.documents.findAll(
          user.id,
          p(req.params.workspaceId),
          page,
          limit,
        ),
      );
    }),
  );
  v1.get(
    '/documents/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.documents.findOne(user.id, p(req.params.id)));
    }),
  );
  v1.delete(
    '/documents/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.documents.remove(user.id, p(req.params.id)));
    }),
  );
  v1.post(
    '/documents/:id/reprocess',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.documents.reprocess(user.id, p(req.params.id)));
    }),
  );

  v1.get('/connectors/types', auth, (_req, res) => {
    res.json(container.connectors.listTypes());
  });
  v1.post(
    '/workspaces/:workspaceId/connectors',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.connectors.create(
          user.id,
          p(req.params.workspaceId),
          req.body,
        ),
      );
    }),
  );
  v1.get(
    '/workspaces/:workspaceId/connectors',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.connectors.findAll(user.id, p(req.params.workspaceId)),
      );
    }),
  );
  v1.get(
    '/connectors/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.connectors.findOne(user.id, p(req.params.id)));
    }),
  );
  v1.patch(
    '/connectors/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.connectors.update(user.id, p(req.params.id), req.body));
    }),
  );
  v1.delete(
    '/connectors/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.connectors.remove(user.id, p(req.params.id)));
    }),
  );
  v1.post(
    '/connectors/:id/test',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.connectors.testConnection(user.id, p(req.params.id)));
    }),
  );
  v1.post(
    '/connectors/:id/sync',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.connectors.enqueueSync(user.id, p(req.params.id)));
    }),
  );

  v1.post(
    '/workspaces/:workspaceId/retrieval/search',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      const { query, topK } = req.body as { query: string; topK?: number };
      res.json(
        await container.retrieval.search(
          user.id,
          p(req.params.workspaceId),
          query,
          topK,
        ),
      );
    }),
  );

  v1.post(
    '/workspaces/:workspaceId/chat',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      const { message, conversationId } = req.body as {
        message: string;
        conversationId?: string;
      };
      res.locals.skipResponseWrap = true;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      try {
        for await (const event of container.chat.streamChat(
          user.id,
          p(req.params.workspaceId),
          message,
          conversationId,
        )) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Chat failed';
        res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      }
      res.end();
    }),
  );
  v1.get(
    '/workspaces/:workspaceId/conversations',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.chat.listConversations(user.id, p(req.params.workspaceId)),
      );
    }),
  );
  v1.get(
    '/conversations/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.chat.getConversation(user.id, p(req.params.id)));
    }),
  );
  v1.get(
    '/conversations/:id/memory',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.chat.getMemory(user.id, p(req.params.id)));
    }),
  );
  v1.delete(
    '/conversations/:id',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(await container.chat.deleteConversation(user.id, p(req.params.id)));
    }),
  );

  v1.post(
    '/messages/:messageId/feedback',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.feedback.create(user.id, p(req.params.messageId), req.body),
      );
    }),
  );
  v1.get(
    '/workspaces/:workspaceId/feedback',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.feedback.listForWorkspace(user.id, p(req.params.workspaceId)),
      );
    }),
  );

  v1.get(
    '/workspaces/:workspaceId/summaries',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.summaries.listForWorkspace(user.id, p(req.params.workspaceId)),
      );
    }),
  );
  v1.post(
    '/workspaces/:workspaceId/summaries/refresh',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.summaries.enqueueWorkspace(
          user.id,
          p(req.params.workspaceId),
        ),
      );
    }),
  );
  v1.post(
    '/connectors/:id/summaries/refresh',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.summaries.enqueueConnector(user.id, p(req.params.id)),
      );
    }),
  );
  v1.post(
    '/documents/:id/summaries/refresh',
    auth,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      res.json(
        await container.summaries.enqueueDocumentForUser(user.id, p(req.params.id)),
      );
    }),
  );

  const admin = [auth, requireSuperAdmin];
  v1.get(
    '/admin/dashboard',
    ...admin,
    asyncHandler(async (_req, res) => {
      res.json(await container.admin.dashboard());
    }),
  );
  v1.get(
    '/analytics/costs',
    ...admin,
    asyncHandler(async (req, res) => {
      const organizationId = (req.query as { organizationId?: string })
        .organizationId;
      res.json(await container.analytics.costSummary(organizationId));
    }),
  );
  v1.post(
    '/evaluation/runs',
    ...admin,
    asyncHandler(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      const body = req.body as {
        workspaceId: string;
        topK?: number;
      };
      res.json(
        await container.evaluation.run({
          userId: user.id,
          workspaceId: body.workspaceId,
          topK: body.topK,
          createdById: user.id,
        }),
      );
    }),
  );
  v1.get(
    '/evaluation/runs',
    ...admin,
    asyncHandler(async (_req, res) => {
      res.json(await container.evaluation.listRuns());
    }),
  );

  api.use('/api/v1', v1);
  return api;
}
