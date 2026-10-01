import type { ConnectorType } from '../types'

export type IntegrationCategory = 'cloud' | 'collab' | 'dev' | 'data'

export type IntegrationDef = {
  type: ConnectorType
  name: string
  tagline: string
  category: IntegrationCategory
  /** CSS gradient for card accent */
  accent: string
  configTemplate: Record<string, unknown>
  fieldsHint: string
}

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  {
    type: 'GOOGLE_DRIVE',
    name: 'Google Drive',
    tagline: 'Index Docs and files from a shared folder.',
    category: 'cloud',
    accent: 'from-[#4285F4]/25 via-[#34A853]/15 to-transparent',
    configTemplate: {
      accessToken: '',
      folderId: '',
    },
    fieldsHint: 'OAuth access token plus Drive folder ID.',
  },
  {
    type: 'SHAREPOINT',
    name: 'OneDrive & SharePoint',
    tagline: 'Microsoft 365 libraries via Graph.',
    category: 'cloud',
    accent: 'from-[#0078D4]/30 via-[#00A4EF]/10 to-transparent',
    configTemplate: {
      accessToken: '',
      siteId: '',
      driveId: '',
      folderPath: 'root',
    },
    fieldsHint: 'Graph bearer token, site ID, and drive ID.',
  },
  {
    type: 'NOTION',
    name: 'Notion',
    tagline: 'Sync pages from a connected database.',
    category: 'collab',
    accent: 'from-ink/15 via-ink/5 to-transparent dark:from-white/15',
    configTemplate: { token: '', databaseId: '' },
    fieldsHint: 'Integration token and database ID.',
  },
  {
    type: 'CONFLUENCE',
    name: 'Confluence',
    tagline: 'Pull wiki pages from Cloud or Data Center.',
    category: 'collab',
    accent: 'from-[#2684FF]/25 to-transparent',
    configTemplate: {
      baseUrl: 'https://your-domain.atlassian.net',
      email: '',
      apiToken: '',
      cql: 'type=page order by lastModified desc',
    },
    fieldsHint: 'Site URL, email, and API token.',
  },
  {
    type: 'SLACK',
    name: 'Slack',
    tagline: 'Channel history for searchable knowledge.',
    category: 'collab',
    accent: 'from-[#E01E5A]/20 via-[#36C5F0]/10 to-transparent',
    configTemplate: { token: '', channelId: '' },
    fieldsHint: 'Bot token with channels:history scope.',
  },
  {
    type: 'JIRA',
    name: 'Jira',
    tagline: 'Issues and descriptions from JQL.',
    category: 'dev',
    accent: 'from-[#0052CC]/25 to-transparent',
    configTemplate: {
      baseUrl: 'https://your-domain.atlassian.net',
      email: '',
      apiToken: '',
      jql: 'order by updated DESC',
    },
    fieldsHint: 'Atlassian API token and optional JQL.',
  },
  {
    type: 'GITHUB',
    name: 'GitHub',
    tagline: 'README and markdown from a repository.',
    category: 'dev',
    accent: 'from-ink/20 to-transparent dark:from-white/20',
    configTemplate: { token: '', owner: '', repo: '' },
    fieldsHint: 'PAT with repo read access.',
  },
  {
    type: 'POSTGRESQL',
    name: 'PostgreSQL',
    tagline: 'Row-backed knowledge from a SQL query.',
    category: 'data',
    accent: 'from-[#336791]/25 to-transparent',
    configTemplate: {
      connectionString: 'postgresql://user:pass@host:5432/db',
      sql: 'SELECT id, name, content FROM articles LIMIT 100',
      idColumn: 'id',
      nameColumn: 'name',
      contentColumn: 'content',
    },
    fieldsHint: 'Read-only connection string and SELECT.',
  },
]

export const DEMO_CONFIG = { mode: 'demo' } as const

export function integrationByType(type: ConnectorType): IntegrationDef | undefined {
  return INTEGRATION_CATALOG.find((i) => i.type === type)
}

export const categoryLabel: Record<IntegrationCategory, string> = {
  cloud: 'Cloud storage',
  collab: 'Collaboration',
  dev: 'Developer tools',
  data: 'Databases',
}
