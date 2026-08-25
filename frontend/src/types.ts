export type ApiSuccess<T> = { success: true; data: T }
export type ApiError = {
  success: false
  statusCode: number
  path: string
  timestamp: string
  message: string | string[]
}

export type UserRole = 'SUPER_ADMIN' | 'USER'
export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export type WorkspaceRole = 'ADMIN' | 'MEMBER'
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM'
export type FeedbackRating = 'UP' | 'DOWN'
export type ConnectorType =
  | 'GOOGLE_DRIVE'
  | 'GITHUB'
  | 'NOTION'
  | 'CONFLUENCE'
  | 'JIRA'
  | 'SLACK'
  | 'SHAREPOINT'
  | 'POSTGRESQL'
export type ConnectorStatus =
  | 'DISCONNECTED'
  | 'CONNECTED'
  | 'SYNCING'
  | 'ERROR'
export type KnowledgeSummaryKind = 'DOCUMENT' | 'WORKSPACE' | 'CONNECTOR'

export type Paginated<T> = {
  items: T[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export type SafeUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  isActive: boolean
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export type AuthPayload = {
  user: SafeUser
  accessToken: string
  refreshToken: string
}

export type Organization = {
  id: string
  name: string
  slug: string
  createdById: string
  createdAt: string
  updatedAt: string
}

export type MemberUser = {
  id: string
  email: string
  firstName: string
  lastName: string
}

export type OrganizationMember = {
  id: string
  role: OrganizationRole
  userId: string
  organizationId: string
  createdAt: string
  user: MemberUser
}

export type Workspace = {
  id: string
  name: string
  description: string | null
  organizationId: string
  createdById: string
  createdAt: string
  updatedAt: string
}

export type WorkspaceMember = {
  id: string
  role: WorkspaceRole
  userId: string
  workspaceId: string
  createdAt: string
  user: MemberUser
}

export type DocumentRecord = {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  storageKey: string
  status: DocumentStatus
  errorMessage: string | null
  metadata: unknown | null
  organizationId: string
  workspaceId: string
  uploadedById: string
  connectorId: string | null
  externalId: string | null
  contentHash: string | null
  createdAt: string
  updatedAt: string
}

export type RetrievedChunk = {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  pageNumber?: number | null
  score: number
  sourceUrl?: string | null
  metadata?: Record<string, unknown> | null
}

export type ChatCitation = {
  index: number
  documentId: string
  documentName: string
  chunkId: string
  pageNumber?: number | null
  sourceUrl?: string | null
}

export type ChatSseEvent =
  | {
      type: 'meta'
      conversationId: string
      citations: ChatCitation[]
      memory: { hasSummary: boolean; recentTurns: number }
    }
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type Message = {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  citations: ChatCitation[] | null
  createdAt: string
}

export type ConversationSummary = {
  id?: string
  summary?: string | null
  summarizedThrough?: number
}

export type ConversationListItem = {
  id: string
  title: string | null
  workspaceId: string
  userId: string
  updatedAt: string
  createdAt: string
  messages: Message[]
  summary: ConversationSummary | null
}

export type ConversationDetail = ConversationListItem & {
  messages: Message[]
}

export type ConversationMemory = {
  conversationSummary: string | null
  recentHistory: { role: 'user' | 'assistant'; content: string }[]
  totalMessages: number
  summarizedThrough: number
}

export type Connector = {
  id: string
  name: string
  type: ConnectorType
  status: ConnectorStatus
  config: Record<string, unknown> | null
  organizationId: string
  workspaceId: string
  createdById: string
  lastSyncedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type KnowledgeSummary = {
  id: string
  kind: KnowledgeSummaryKind
  title: string
  summary: string
  documentId: string | null
  connectorId: string | null
  updatedAt: string
}

export type CostSummary = {
  monthlyCost: number
  tokenUsage: number
  dailyCost: Record<string, number>
  costPerOrganization: Record<string, number>
  costPerUser: Record<string, number>
  costPerModel: Record<string, number>
}

export type AdminDashboard = {
  totalUsers: number
  activeUsers: number
  organizations: number
  workspaces: number
  documents: number
  indexedChunks: number
  queries24h: number
  averageLatencyMs: number
  connectorHealth: {
    byStatus: Record<string, number>
    failedJobs: number
  }
  redisOk: boolean
  costs: CostSummary
}

export type EvalMetrics = {
  recallAtK: number
  precisionAtK: number
  mrr: number
  citationAccuracy: number
  answerRelevance: number
  faithfulness: number
  averageLatencyMs: number
  tokenCost: number
  topK: number
  cases: number
}

export type EvalRunResult = {
  runId: string
  metrics: EvalMetrics
  details: object[]
}

export type EvaluationRun = {
  id: string
  name: string
  datasetVersion: string
  metrics: EvalMetrics | Record<string, unknown>
  details: unknown
  createdById: string | null
  createdAt: string
}

export type HealthReady = {
  status: string
  checks?: { database: string; redis: string }
  timestamp?: string
}

export type MessageFeedback = {
  id: string
  rating: FeedbackRating
  comment: string | null
  messageId: string
  userId: string
  createdAt: string
}
