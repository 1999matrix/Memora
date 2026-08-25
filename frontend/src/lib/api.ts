import type {
  AdminDashboard,
  ApiSuccess,
  AuthPayload,
  Connector,
  ConnectorType,
  ConversationDetail,
  ConversationListItem,
  ConversationMemory,
  CostSummary,
  DocumentRecord,
  EvaluationRun,
  EvalRunResult,
  FeedbackRating,
  HealthReady,
  KnowledgeSummary,
  MessageFeedback,
  Organization,
  OrganizationMember,
  OrganizationRole,
  Paginated,
  RetrievedChunk,
  SafeUser,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '../types'
import { API_ORIGIN, http, unwrap } from './client'

export const authApi = {
  register: (body: {
    email: string
    password: string
    firstName: string
    lastName: string
  }) => http.post<ApiSuccess<AuthPayload>>('/auth/register', body).then((r) => unwrap(r.data)),
  login: (body: { email: string; password: string }) =>
    http.post<ApiSuccess<AuthPayload>>('/auth/login', body).then((r) => unwrap(r.data)),
  logout: () => http.post<ApiSuccess<{ success: boolean }>>('/auth/logout').then((r) => unwrap(r.data)),
  me: () => http.get<ApiSuccess<SafeUser>>('/auth/me').then((r) => unwrap(r.data)),
}

export const usersApi = {
  me: () => http.get<ApiSuccess<SafeUser>>('/users/me').then((r) => unwrap(r.data)),
  updateMe: (body: { firstName?: string; lastName?: string; password?: string }) =>
    http.patch<ApiSuccess<SafeUser>>('/users/me', body).then((r) => unwrap(r.data)),
}

export const orgsApi = {
  list: (page = 1, limit = 50) =>
    http
      .get<ApiSuccess<Paginated<Organization>>>('/organizations', { params: { page, limit } })
      .then((r) => unwrap(r.data)),
  create: (name: string) =>
    http.post<ApiSuccess<Organization>>('/organizations', { name }).then((r) => unwrap(r.data)),
  get: (id: string) =>
    http.get<ApiSuccess<Organization>>(`/organizations/${id}`).then((r) => unwrap(r.data)),
  update: (id: string, name: string) =>
    http.patch<ApiSuccess<Organization>>(`/organizations/${id}`, { name }).then((r) => unwrap(r.data)),
  remove: (id: string) =>
    http.delete<ApiSuccess<unknown>>(`/organizations/${id}`).then((r) => unwrap(r.data)),
  members: (id: string) =>
    http.get<ApiSuccess<OrganizationMember[]>>(`/organizations/${id}/members`).then((r) => unwrap(r.data)),
  addMember: (id: string, body: { email: string; role: Exclude<OrganizationRole, 'OWNER'> }) =>
    http.post<ApiSuccess<OrganizationMember>>(`/organizations/${id}/members`, body).then((r) => unwrap(r.data)),
  updateMember: (id: string, userId: string, role: OrganizationRole) =>
    http
      .patch<ApiSuccess<OrganizationMember>>(`/organizations/${id}/members/${userId}`, { role })
      .then((r) => unwrap(r.data)),
  removeMember: (id: string, userId: string) =>
    http.delete<ApiSuccess<unknown>>(`/organizations/${id}/members/${userId}`).then((r) => unwrap(r.data)),
}

export const workspacesApi = {
  list: (page = 1, limit = 50) =>
    http
      .get<ApiSuccess<Paginated<Workspace>>>('/workspaces', { params: { page, limit } })
      .then((r) => unwrap(r.data)),
  create: (body: { name: string; description?: string; organizationId: string }) =>
    http.post<ApiSuccess<Workspace>>('/workspaces', body).then((r) => unwrap(r.data)),
  get: (id: string) => http.get<ApiSuccess<Workspace>>(`/workspaces/${id}`).then((r) => unwrap(r.data)),
  update: (id: string, body: { name?: string; description?: string }) =>
    http.patch<ApiSuccess<Workspace>>(`/workspaces/${id}`, body).then((r) => unwrap(r.data)),
  remove: (id: string) =>
    http.delete<ApiSuccess<unknown>>(`/workspaces/${id}`).then((r) => unwrap(r.data)),
  members: (id: string) =>
    http.get<ApiSuccess<WorkspaceMember[]>>(`/workspaces/${id}/members`).then((r) => unwrap(r.data)),
  addMember: (id: string, body: { email: string; role: WorkspaceRole }) =>
    http.post<ApiSuccess<WorkspaceMember>>(`/workspaces/${id}/members`, body).then((r) => unwrap(r.data)),
  updateMember: (id: string, userId: string, role: WorkspaceRole) =>
    http
      .patch<ApiSuccess<WorkspaceMember>>(`/workspaces/${id}/members/${userId}`, { role })
      .then((r) => unwrap(r.data)),
  removeMember: (id: string, userId: string) =>
    http.delete<ApiSuccess<unknown>>(`/workspaces/${id}/members/${userId}`).then((r) => unwrap(r.data)),
}

export const documentsApi = {
  list: (workspaceId: string, page = 1, limit = 20) =>
    http
      .get<ApiSuccess<Paginated<DocumentRecord>>>(`/workspaces/${workspaceId}/documents`, {
        params: { page, limit },
      })
      .then((r) => unwrap(r.data)),
  get: (id: string) => http.get<ApiSuccess<DocumentRecord>>(`/documents/${id}`).then((r) => unwrap(r.data)),
  remove: (id: string) => http.delete<ApiSuccess<unknown>>(`/documents/${id}`).then((r) => unwrap(r.data)),
  upload: (workspaceId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http
      .post<ApiSuccess<DocumentRecord>>(`/workspaces/${workspaceId}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => unwrap(r.data))
  },
}

export const retrievalApi = {
  search: (workspaceId: string, query: string, topK?: number) =>
    http
      .post<ApiSuccess<RetrievedChunk[]>>(`/workspaces/${workspaceId}/retrieval/search`, {
        query,
        topK,
      })
      .then((r) => unwrap(r.data)),
}

export const chatApi = {
  conversations: (workspaceId: string) =>
    http
      .get<ApiSuccess<ConversationListItem[]>>(`/workspaces/${workspaceId}/conversations`)
      .then((r) => unwrap(r.data)),
  get: (id: string) =>
    http.get<ApiSuccess<ConversationDetail>>(`/conversations/${id}`).then((r) => unwrap(r.data)),
  memory: (id: string) =>
    http.get<ApiSuccess<ConversationMemory>>(`/conversations/${id}/memory`).then((r) => unwrap(r.data)),
  remove: (id: string) =>
    http.delete<ApiSuccess<{ success: boolean }>>(`/conversations/${id}`).then((r) => unwrap(r.data)),
}

export const feedbackApi = {
  create: (messageId: string, body: { rating: FeedbackRating; comment?: string }) =>
    http.post<ApiSuccess<unknown>>(`/messages/${messageId}/feedback`, body).then((r) => unwrap(r.data)),
  list: (workspaceId: string) =>
    http
      .get<ApiSuccess<MessageFeedback[]>>(`/workspaces/${workspaceId}/feedback`)
      .then((r) => unwrap(r.data)),
}

export const connectorsApi = {
  types: () => http.get<ApiSuccess<ConnectorType[]>>('/connectors/types').then((r) => unwrap(r.data)),
  list: (workspaceId: string) =>
    http.get<ApiSuccess<Connector[]>>(`/workspaces/${workspaceId}/connectors`).then((r) => unwrap(r.data)),
  create: (workspaceId: string, body: { name: string; type: ConnectorType; config?: Record<string, unknown> }) =>
    http.post<ApiSuccess<Connector>>(`/workspaces/${workspaceId}/connectors`, body).then((r) => unwrap(r.data)),
  get: (id: string) => http.get<ApiSuccess<Connector>>(`/connectors/${id}`).then((r) => unwrap(r.data)),
  update: (id: string, body: { name?: string; config?: Record<string, unknown> }) =>
    http.patch<ApiSuccess<Connector>>(`/connectors/${id}`, body).then((r) => unwrap(r.data)),
  remove: (id: string) =>
    http.delete<ApiSuccess<{ success: boolean }>>(`/connectors/${id}`).then((r) => unwrap(r.data)),
  test: (id: string) =>
    http.post<ApiSuccess<{ ok: boolean }>>(`/connectors/${id}/test`).then((r) => unwrap(r.data)),
  sync: (id: string) =>
    http
      .post<ApiSuccess<{ jobId: string; connectorId: string; status: string }>>(`/connectors/${id}/sync`)
      .then((r) => unwrap(r.data)),
}

export const summariesApi = {
  list: (workspaceId: string) =>
    http
      .get<ApiSuccess<KnowledgeSummary[]>>(`/workspaces/${workspaceId}/summaries`)
      .then((r) => unwrap(r.data)),
  refreshWorkspace: (workspaceId: string) =>
    http
      .post<ApiSuccess<{ status: string; kind: string; workspaceId: string }>>(
        `/workspaces/${workspaceId}/summaries/refresh`,
      )
      .then((r) => unwrap(r.data)),
  refreshConnector: (id: string) =>
    http.post<ApiSuccess<unknown>>(`/connectors/${id}/summaries/refresh`).then((r) => unwrap(r.data)),
  refreshDocument: (id: string) =>
    http.post<ApiSuccess<unknown>>(`/documents/${id}/summaries/refresh`).then((r) => unwrap(r.data)),
}

export const adminApi = {
  dashboard: () => http.get<ApiSuccess<AdminDashboard>>('/admin/dashboard').then((r) => unwrap(r.data)),
  costs: (organizationId?: string) =>
    http
      .get<ApiSuccess<CostSummary>>('/analytics/costs', { params: { organizationId } })
      .then((r) => unwrap(r.data)),
  evalRuns: () => http.get<ApiSuccess<EvaluationRun[]>>('/evaluation/runs').then((r) => unwrap(r.data)),
  runEval: (workspaceId: string, topK?: number) =>
    http.post<ApiSuccess<EvalRunResult>>('/evaluation/runs', { workspaceId, topK }).then((r) => unwrap(r.data)),
}

export const healthApi = {
  ready: () =>
    http.get<ApiSuccess<HealthReady> | HealthReady>(`${API_ORIGIN}/health/ready`).then((r) => {
      const body = r.data as ApiSuccess<HealthReady> | HealthReady
      if (body && typeof body === 'object' && 'success' in body && body.success) {
        return body.data
      }
      return body as HealthReady
    }),
}
