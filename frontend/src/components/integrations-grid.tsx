import {
  Cloud,
  Database,
  GithubLogo,
  HardDrives,
  Kanban,
  SlackLogo,
  Notepad,
  PlugsConnected,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

import { cn } from '../lib/format'
import type { IntegrationDef, IntegrationCategory } from '../lib/integrations'
import { INTEGRATION_CATALOG, categoryLabel } from '../lib/integrations'
import type { Connector, ConnectorType } from '../types'
import { Badge, Button } from './ui'

const iconByType: Partial<Record<ConnectorType, Icon>> = {
  GOOGLE_DRIVE: Cloud,
  SHAREPOINT: HardDrives,
  NOTION: Notepad,
  CONFLUENCE: Notepad,
  SLACK: SlackLogo,
  JIRA: Kanban,
  GITHUB: GithubLogo,
  POSTGRESQL: Database,
}

function IntegrationIcon({ type }: { type: ConnectorType }) {
  const Ic = iconByType[type] ?? PlugsConnected
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink/6 ring-1 ring-ink/8 dark:bg-white/8 dark:ring-white/10"
    >
      <Ic size={22} weight="duotone" className="text-ink/80 dark:text-white/85" />
    </span>
  )
}

export function IntegrationsCatalog({
  connectedTypes,
  onSelect,
  activeType,
}: {
  connectedTypes: Set<ConnectorType>
  onSelect: (def: IntegrationDef) => void
  activeType?: ConnectorType
}) {
  const categories = ['cloud', 'collab', 'dev', 'data'] as IntegrationCategory[]

  return (
    <div className="space-y-10">
      {categories.map((cat) => {
        const items = INTEGRATION_CATALOG.filter((i) => i.category === cat)
        if (!items.length) return null
        return (
          <section key={cat}>
            <h2 className="text-sm font-semibold tracking-tight text-ink dark:text-white">
              {categoryLabel[cat]}
            </h2>
            <div
              className="mt-4 grid grid-flow-dense gap-3 sm:grid-cols-2 xl:grid-cols-3"
              style={{ gridAutoRows: 'minmax(8.5rem, auto)' }}
            >
              {items.map((def) => {
                const connected = connectedTypes.has(def.type)
                const active = activeType === def.type
                return (
                  <button
                    key={def.type}
                    type="button"
                    onClick={() => onSelect(def)}
                    className={cn(
                      'group relative overflow-hidden rounded-[1.25rem] p-4 text-left ring-1 transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
                      'bg-surface dark:bg-[#141820]',
                      active
                        ? 'ring-accent shadow-[0_0_0_1px_rgba(14,107,92,0.35)]'
                        : 'ring-ink/8 hover:ring-ink/14 dark:ring-white/10 dark:hover:ring-white/18',
                    )}
                  >
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80 transition duration-700 group-hover:opacity-100',
                        def.accent,
                      )}
                    />
                    <div className="relative flex h-full flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <IntegrationIcon type={def.type} />
                        {connected ? (
                          <Badge tone="good">Connected</Badge>
                        ) : (
                          <Badge tone="neutral">Available</Badge>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold tracking-tight text-ink dark:text-white">
                          {def.name}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-ink/55 dark:text-white/50">
                          {def.tagline}
                        </p>
                      </div>
                      <span
                        className="mt-auto text-xs font-medium text-accent opacity-0 transition duration-300 group-hover:opacity-100"
                      >
                        Configure
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function ConnectedIntegrationsList({
  connectors,
  typeLabel,
  onTest,
  onSync,
  onSummary,
  onRemove,
}: {
  connectors: Connector[]
  typeLabel: Record<string, string>
  onTest: (id: string) => void
  onSync: (id: string) => void
  onSummary: (id: string) => void
  onRemove: (id: string) => void
}) {
  if (!connectors.length) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight text-ink dark:text-white">
        Active connections
      </h2>
      <div className="space-y-2">
        {connectors.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink/4 px-4 py-3 ring-1 ring-ink/6 dark:bg-white/5 dark:ring-white/8"
          >
            <div className="flex min-w-0 items-center gap-3">
              <IntegrationIcon type={c.type} />
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-ink/45 dark:text-white/45">
                  {typeLabel[c.type] ?? c.type}
                  {c.lastSyncedAt ? ` · synced ${new Date(c.lastSyncedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  c.status === 'CONNECTED'
                    ? 'good'
                    : c.status === 'ERROR'
                      ? 'bad'
                      : c.status === 'SYNCING'
                        ? 'warn'
                        : 'neutral'
                }
              >
                {c.status}
              </Badge>
              <Button variant="secondary" type="button" onClick={() => onTest(c.id)}>
                Test
              </Button>
              <Button variant="secondary" type="button" onClick={() => onSync(c.id)}>
                Sync
              </Button>
              <Button variant="ghost" type="button" onClick={() => onSummary(c.id)}>
                Summary
              </Button>
              <Button variant="ghost" type="button" onClick={() => onRemove(c.id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
