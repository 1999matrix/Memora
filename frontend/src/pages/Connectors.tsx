import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import {
  ConnectedIntegrationsList,
  IntegrationsCatalog,
} from '../components/integrations-grid'
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Surface,
  Textarea,
} from '../components/ui'
import { connectorsApi, summariesApi } from '../lib/api'
import { errorMessage } from '../lib/client'
import {
  DEMO_CONFIG,
  integrationByType,
  INTEGRATION_CATALOG,
} from '../lib/integrations'
import type { ConnectorType } from '../types'

const typeLabel: Record<string, string> = Object.fromEntries(
  INTEGRATION_CATALOG.map((i) => [i.type, i.name]),
)

export function ConnectorsPage() {
  const { workspaceId = '' } = useParams()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<ConnectorType>('GOOGLE_DRIVE')
  const [configText, setConfigText] = useState(
    JSON.stringify(integrationByType('GOOGLE_DRIVE')?.configTemplate ?? {}, null, 2),
  )
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const types = useQuery({ queryKey: ['connector-types'], queryFn: () => connectorsApi.types() })
  const list = useQuery({
    queryKey: ['connectors', workspaceId],
    queryFn: () => connectorsApi.list(workspaceId),
    enabled: Boolean(workspaceId),
  })

  const connectedTypes = useMemo(
    () => new Set((list.data ?? []).map((c) => c.type)),
    [list.data],
  )

  const create = useMutation({
    mutationFn: () => {
      let config: Record<string, unknown> | undefined
      if (configText.trim()) {
        try {
          config = JSON.parse(configText) as Record<string, unknown>
        } catch {
          throw new Error('Config must be valid JSON')
        }
      }
      return connectorsApi.create(workspaceId, { name: name.trim(), type, config })
    },
    onSuccess: () => {
      setName('')
      setSuccess('Integration connected. Sync is queued when you run Sync.')
      setError('')
      void qc.invalidateQueries({ queryKey: ['connectors', workspaceId] })
    },
    onError: (err) => {
      setSuccess('')
      setError(errorMessage(err))
    },
  })

  const selectIntegration = (def: (typeof INTEGRATION_CATALOG)[number]) => {
    setType(def.type)
    setName(def.name)
    setConfigText(JSON.stringify(def.configTemplate, null, 2))
    setError('')
    setSuccess('')
  }

  const apiTypes = types.data?.length ? types.data : INTEGRATION_CATALOG.map((i) => i.type)
  const selected = integrationByType(type)

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Integrations"
          description="Connect cloud storage, collaboration tools, and databases. Live drivers sync content into your workspace index; use demo mode to try the flow without credentials."
        />

        {error ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        {success ? (
          <div className="mb-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent dark:bg-accent/15 dark:text-[#9ad4c7]">
            {success}
          </div>
        ) : null}

        <div className="mb-12 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0">
            {list.isLoading ? <Skeleton className="mb-8 h-24" /> : null}
            <ConnectedIntegrationsList
              connectors={list.data ?? []}
              typeLabel={typeLabel}
              onTest={(id) => {
                void connectorsApi
                  .test(id)
                  .then((r) => {
                    setError(r.ok ? '' : 'Connection test failed')
                    if (r.ok) setSuccess('Connection test passed')
                  })
                  .catch((err) => setError(errorMessage(err)))
              }}
              onSync={(id) => {
                void connectorsApi
                  .sync(id)
                  .then(() => {
                    setSuccess('Sync queued')
                    void qc.invalidateQueries({ queryKey: ['connectors', workspaceId] })
                  })
                  .catch((err) => setError(errorMessage(err)))
              }}
              onSummary={(id) => {
                void summariesApi.refreshConnector(id).catch((err) => setError(errorMessage(err)))
              }}
              onRemove={(id) => {
                void connectorsApi
                  .remove(id)
                  .then(() => qc.invalidateQueries({ queryKey: ['connectors', workspaceId] }))
                  .catch((err) => setError(errorMessage(err)))
              }}
            />

            {!list.isLoading && !list.data?.length ? (
              <EmptyState
                title="No active connections"
                body="Pick an integration below. Google Drive, OneDrive (SharePoint), Notion, Slack, and more share the same sync pipeline."
              />
            ) : null}

            <IntegrationsCatalog
              connectedTypes={connectedTypes}
              activeType={type}
              onSelect={selectIntegration}
            />
          </div>

          <Surface className="h-fit lg:sticky lg:top-8">
            <form
              className="space-y-4 p-5"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                setError('')
                setSuccess('')
                create.mutate()
              }}
            >
              <div>
                <h2 className="font-semibold tracking-tight">Connect {selected?.name ?? 'source'}</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink/50 dark:text-white/45">
                  {selected?.fieldsHint}
                </p>
              </div>
              <Field label="Display name">
                <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
              </Field>
              <Field label="Backend type">
                <p className="rounded-[10px] bg-ink/5 px-3 py-2 text-xs font-mono text-ink/70 dark:bg-white/6 dark:text-white/60">
                  {type}
                  {!apiTypes.includes(type) ? ' (not reported by API)' : ''}
                </p>
              </Field>
              <Field label="Configuration" hint="JSON credentials. Stored server-side; use secrets manager in production.">
                <Textarea
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  className="min-h-40 font-mono text-xs"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setConfigText(JSON.stringify(DEMO_CONFIG, null, 2))
                    setSuccess('')
                    setError('')
                  }}
                >
                  Use demo mode
                </Button>
                <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
                  {create.isPending ? 'Connecting…' : 'Connect'}
                </Button>
              </div>
            </form>
          </Surface>
        </div>
      </div>
    </div>
  )
}
