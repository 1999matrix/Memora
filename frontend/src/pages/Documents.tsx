import { Trash, UploadSimple } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Alert, Badge, Button, EmptyState, PageHeader, Skeleton, Surface } from '../components/ui'
import { documentsApi, summariesApi } from '../lib/api'
import { errorMessage } from '../lib/client'
import { formatBytes, formatDateTime } from '../lib/format'
import type { DocumentStatus } from '../types'

function statusTone(status: DocumentStatus) {
  if (status === 'READY') return 'good' as const
  if (status === 'FAILED') return 'bad' as const
  if (status === 'PROCESSING') return 'warn' as const
  return 'neutral' as const
}

export function DocumentsPage() {
  const { workspaceId = '' } = useParams()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const docs = useQuery({
    queryKey: ['documents', workspaceId, page],
    queryFn: () => documentsApi.list(workspaceId, page, 20),
    enabled: Boolean(workspaceId),
  })

  const inflight = docs.data?.items.some((d) => d.status === 'PENDING' || d.status === 'PROCESSING')

  useEffect(() => {
    if (!inflight) return
    const id = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['documents', workspaceId] })
    }, 3000)
    return () => window.clearInterval(id)
  }, [inflight, qc, workspaceId])

  const upload = useMutation({
    mutationFn: (file: File) => documentsApi.upload(workspaceId, file),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', workspaceId] }),
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <PageHeader
        title="Documents"
        description="PDF, DOCX, TXT, and Markdown up to 20 MB. Chat works reliably after status is Ready."
        actions={
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                setError('')
                upload.mutate(file)
              }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
              <UploadSimple size={16} />
              {upload.isPending ? 'Uploading...' : 'Upload file'}
            </Button>
          </>
        }
      />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {docs.isLoading ? <Skeleton className="h-40" /> : null}
      {!docs.isLoading && !docs.data?.items.length ? (
        <EmptyState title="No documents" body="Upload a file to start indexing. Processing is queued and may take a few seconds." />
      ) : null}
      <div className="space-y-2">
        {docs.data?.items.map((doc) => (
          <Surface key={doc.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{doc.name}</p>
                <p className="mt-1 text-xs text-ink/45 dark:text-white/40">
                  {formatBytes(doc.sizeBytes)} · {formatDateTime(doc.createdAt)}
                  {doc.errorMessage ? ` · ${doc.errorMessage}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
                <Button
                  variant="ghost"
                  onClick={() => {
                    void summariesApi.refreshDocument(doc.id).catch((err) => setError(errorMessage(err)))
                  }}
                >
                  Refresh summary
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    void documentsApi
                      .remove(doc.id)
                      .then(() => qc.invalidateQueries({ queryKey: ['documents', workspaceId] }))
                      .catch((err) => setError(errorMessage(err)))
                  }}
                >
                  <Trash size={16} />
                </Button>
              </div>
            </div>
          </Surface>
        ))}
      </div>
      {docs.data && docs.data.meta.totalPages > 1 ? (
        <div className="mt-6 flex items-center gap-3 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="font-mono text-xs text-ink/50">
            {docs.data.meta.page} / {docs.data.meta.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= docs.data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}
