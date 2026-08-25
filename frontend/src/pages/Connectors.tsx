import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { Alert, Badge, Button, EmptyState, Field, Input, PageHeader, Select, Skeleton, Surface, Textarea } from '../components/ui'
import { connectorsApi, summariesApi } from '../lib/api'
import { errorMessage } from '../lib/client'
import type { ConnectorStatus, ConnectorType } from '../types'

const typeLabel: Record<string, string> = {
  GOOGLE_DRIVE: 'Google Drive',
  GITHUB: 'GitHub',
  NOTION: 'Notion',
  CONFLUENCE: 'Confluence',
  JIRA: 'Jira',
  SLACK: 'Slack',
  SHAREPOINT: 'SharePoint',
  POSTGRESQL: 'PostgreSQL',
}

function tone(status: ConnectorStatus) {
  if (status === 'CONNECTED') return 'good' as const
  if (status === 'ERROR') return 'bad' as const
  if (status === 'SYNCING') return 'warn' as const
  return 'neutral' as const
}

export function ConnectorsPage() {
  const { workspaceId = '' } = useParams()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<ConnectorType>('GITHUB')
  const [configText, setConfigText] = useState('{}')
  const [error, setError] = useState('')

  const types = useQuery({ queryKey: ['connector-types'], queryFn: () => connectorsApi.types() })
  const list = useQuery({
    queryKey: ['connectors', workspaceId],
    queryFn: () => connectorsApi.list(workspaceId),
    enabled: Boolean(workspaceId),
  })

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
      setConfigText('{}')
      void qc.invalidateQueries({ queryKey: ['connectors', workspaceId] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const options = types.data?.length ? types.data : (Object.keys(typeLabel) as ConnectorType[])

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <PageHeader
        title="Connectors"
        description="Drivers are stubs today. You can still create, test, and queue a sync, then poll status."
      />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          {list.isLoading ? <Skeleton className="h-24" /> : null}
          {!list.isLoading && !list.data?.length ? (
            <EmptyState title="No connectors" body="Add a source. Sync runs asynchronously and may create documents when a driver is live." />
          ) : null}
          {list.data?.map((c) => (
            <Surface key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="mt-0.5 text-xs text-ink/45">
                    {typeLabel[c.type] ?? c.type}
                    {c.lastError ? ` · ${c.lastError}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone(c.status)}>{c.status}</Badge>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void connectorsApi.test(c.id).then((r) => setError(r.ok ? '' : 'Test failed')).catch((err) => setError(errorMessage(err)))
                    }}
                  >
                    Test
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void connectorsApi.sync(c.id).then(() => qc.invalidateQueries({ queryKey: ['connectors', workspaceId] })).catch((err) => setError(errorMessage(err)))
                    }}
                  >
                    Sync
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void summariesApi.refreshConnector(c.id).catch((err) => setError(errorMessage(err)))
                    }}
                  >
                    Summary
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void connectorsApi.remove(c.id).then(() => qc.invalidateQueries({ queryKey: ['connectors', workspaceId] })).catch((err) => setError(errorMessage(err)))
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </Surface>
          ))}
        </div>
        <Surface>
          <form
            className="space-y-4 p-5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              setError('')
              try {
                create.mutate()
              } catch (err) {
                setError(errorMessage(err))
              }
            }}
          >
            <h2 className="font-semibold">Add connector</h2>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as ConnectorType)}>
                {options.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel[t] ?? t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Config" hint="Non-secret JSON. Secrets are not stored here yet.">
              <Textarea value={configText} onChange={(e) => setConfigText(e.target.value)} className="font-mono text-xs" />
            </Field>
            <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
              Create
            </Button>
          </form>
        </Surface>
      </div>
    </div>
  )
}
