import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

import type { AppConfigService } from '../lib/config.js';

export function mountSwagger(app: Express, config: AppConfigService): void {
  const title = config.get<string>('app.name') ?? 'Enterprise AI Assistant';
  const version = config.get<string>('app.version') ?? '1.0.0';

  const spec = {
    openapi: '3.0.3',
    info: {
      title,
      description: 'Enterprise Knowledge Assistant APIs',
      version,
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {},
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          security: [],
          summary: 'Health check',
        },
      },
      '/health/live': {
        get: {
          tags: ['Health'],
          security: [],
          summary: 'Liveness probe',
        },
      },
      '/health/ready': {
        get: {
          tags: ['Health'],
          security: [],
          summary: 'Readiness probe',
        },
      },
      '/api/v1/auth/register': {
        post: {
          tags: ['Auth'],
          security: [],
          summary: 'Register',
        },
      },
      '/api/v1/auth/login': {
        post: {
          tags: ['Auth'],
          security: [],
          summary: 'Login',
        },
      },
      '/api/v1/auth/refresh': {
        post: {
          tags: ['Auth'],
          security: [],
          summary: 'Refresh tokens',
        },
      },
      '/api/v1/auth/logout': {
        post: { tags: ['Auth'], summary: 'Logout' },
      },
      '/api/v1/auth/me': {
        get: { tags: ['Auth'], summary: 'Current user (auth)' },
      },
      '/api/v1/users/me': {
        get: { tags: ['Users'], summary: 'Current user profile' },
        patch: { tags: ['Users'], summary: 'Update profile' },
      },
      '/api/v1/users/{id}': {
        get: { tags: ['Users'], summary: 'User by id' },
      },
      '/api/v1/organizations': {
        post: { tags: ['Organizations'], summary: 'Create organization' },
        get: { tags: ['Organizations'], summary: 'List organizations' },
      },
      '/api/v1/organizations/{id}': {
        get: { tags: ['Organizations'], summary: 'Get organization' },
        patch: { tags: ['Organizations'], summary: 'Update organization' },
        delete: { tags: ['Organizations'], summary: 'Delete organization' },
      },
      '/api/v1/organizations/{id}/members': {
        get: { tags: ['Organizations'], summary: 'List members' },
        post: { tags: ['Organizations'], summary: 'Add member' },
      },
      '/api/v1/organizations/{id}/members/{userId}': {
        patch: { tags: ['Organizations'], summary: 'Update member role' },
        delete: { tags: ['Organizations'], summary: 'Remove member' },
      },
      '/api/v1/workspaces': {
        post: { tags: ['Workspaces'], summary: 'Create workspace' },
        get: { tags: ['Workspaces'], summary: 'List workspaces' },
      },
      '/api/v1/workspaces/{id}': {
        get: { tags: ['Workspaces'], summary: 'Get workspace' },
        patch: { tags: ['Workspaces'], summary: 'Update workspace' },
        delete: { tags: ['Workspaces'], summary: 'Delete workspace' },
      },
      '/api/v1/workspaces/{id}/members': {
        get: { tags: ['Workspaces'], summary: 'List workspace members' },
        post: { tags: ['Workspaces'], summary: 'Add workspace member' },
      },
      '/api/v1/workspaces/{id}/members/{userId}': {
        patch: { tags: ['Workspaces'], summary: 'Update workspace member' },
        delete: { tags: ['Workspaces'], summary: 'Remove workspace member' },
      },
      '/api/v1/workspaces/{workspaceId}/documents': {
        post: {
          tags: ['Documents'],
          summary: 'Upload document (multipart field: file)',
        },
        get: { tags: ['Documents'], summary: 'List workspace documents' },
      },
      '/api/v1/documents/{id}': {
        get: { tags: ['Documents'], summary: 'Get document' },
        delete: { tags: ['Documents'], summary: 'Delete document' },
      },
      '/api/v1/documents/{id}/reprocess': {
        post: { tags: ['Documents'], summary: 'Reprocess document' },
      },
      '/api/v1/connectors/types': {
        get: { tags: ['Connectors'], summary: 'List connector types' },
      },
      '/api/v1/workspaces/{workspaceId}/connectors': {
        post: { tags: ['Connectors'], summary: 'Create connector' },
        get: { tags: ['Connectors'], summary: 'List connectors' },
      },
      '/api/v1/connectors/{id}': {
        get: { tags: ['Connectors'], summary: 'Get connector' },
        patch: { tags: ['Connectors'], summary: 'Update connector' },
        delete: { tags: ['Connectors'], summary: 'Delete connector' },
      },
      '/api/v1/connectors/{id}/test': {
        post: { tags: ['Connectors'], summary: 'Test connector' },
      },
      '/api/v1/connectors/{id}/sync': {
        post: { tags: ['Connectors'], summary: 'Enqueue connector sync' },
      },
      '/api/v1/workspaces/{workspaceId}/retrieval/search': {
        post: { tags: ['Retrieval'], summary: 'Semantic search' },
      },
      '/api/v1/workspaces/{workspaceId}/chat': {
        post: {
          tags: ['Chat'],
          summary: 'Stream chat (SSE)',
          description: 'Returns text/event-stream, not JSON envelope',
        },
      },
      '/api/v1/workspaces/{workspaceId}/conversations': {
        get: { tags: ['Chat'], summary: 'List conversations' },
      },
      '/api/v1/conversations/{id}': {
        get: { tags: ['Chat'], summary: 'Get conversation' },
        delete: { tags: ['Chat'], summary: 'Delete conversation' },
      },
      '/api/v1/conversations/{id}/memory': {
        get: { tags: ['Chat'], summary: 'Conversation memory' },
      },
      '/api/v1/messages/{messageId}/feedback': {
        post: { tags: ['Feedback'], summary: 'Submit feedback' },
      },
      '/api/v1/workspaces/{workspaceId}/feedback': {
        get: { tags: ['Feedback'], summary: 'List workspace feedback' },
      },
      '/api/v1/workspaces/{workspaceId}/summaries': {
        get: { tags: ['Summaries'], summary: 'List summaries' },
      },
      '/api/v1/workspaces/{workspaceId}/summaries/refresh': {
        post: { tags: ['Summaries'], summary: 'Refresh workspace summary' },
      },
      '/api/v1/connectors/{id}/summaries/refresh': {
        post: { tags: ['Summaries'], summary: 'Refresh connector summary' },
      },
      '/api/v1/documents/{id}/summaries/refresh': {
        post: { tags: ['Summaries'], summary: 'Refresh document summary' },
      },
      '/api/v1/admin/dashboard': {
        get: { tags: ['Admin'], summary: 'Admin dashboard' },
      },
      '/api/v1/analytics/costs': {
        get: { tags: ['Analytics'], summary: 'Cost summary' },
      },
      '/api/v1/evaluation/runs': {
        post: { tags: ['Evaluation'], summary: 'Run evaluation' },
        get: { tags: ['Evaluation'], summary: 'List evaluation runs' },
      },
    },
  };

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
