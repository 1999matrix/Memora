import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { Alert, Badge, Button, EmptyState, PageHeader, Skeleton, Surface } from '../components/ui'
import { summariesApi } from '../lib/api'
import { errorMessage } from '../lib/client'
import { formatDateTime } from '../lib/format'

export function SummariesPage() {
  const { workspaceId = '' } = useParams()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [queued, setQueued] = useState('')

  const list = useQuery({
    queryKey: ['summaries', workspaceId],
    queryFn: () => summariesApi.list(workspaceId),
    enabled: Boolean(workspaceId),
  })

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <PageHeader
        title="Knowledge summaries"
        description="Workspace, document, and connector rollups. Refresh enqueues a background job."
        actions={
          <Button
            onClick={() => {
              setError('')
              void summariesApi
                .refreshWorkspace(workspaceId)
                .then((r) => {
                  setQueued(`Queued ${r.kind.toLowerCase()} summary`)
                  void qc.invalidateQueries({ queryKey: ['summaries', workspaceId] })
                })
                .catch((err) => setError(errorMessage(err)))
            }}
          >
            Refresh workspace summary
          </Button>
        }
      />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {queued ? <p className="mb-4 text-sm text-accent">{queued}</p> : null}
      {list.isLoading ? <Skeleton className="h-40" /> : null}
      {!list.isLoading && !list.data?.length ? (
        <EmptyState title="No summaries yet" body="Index documents, then refresh. Summaries appear here once the job finishes." />
      ) : null}
      <div className="space-y-4">
        {list.data?.map((s) => (
          <Surface key={s.id}>
            <div className="p-5">
              <div className="flex items-center gap-2">
                <Badge>{s.kind}</Badge>
                <span className="text-xs text-ink/40">{formatDateTime(s.updatedAt)}</span>
              </div>
              <h2 className="mt-3 font-semibold">{s.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/70 dark:text-white/60">{s.summary}</p>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  )
}
