import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { Alert, Badge, Button, EmptyState, Field, Input, PageHeader, Surface } from '../components/ui'
import { retrievalApi } from '../lib/api'
import { errorMessage } from '../lib/client'
import type { RetrievedChunk } from '../types'

export function SearchPage() {
  const { workspaceId = '' } = useParams()
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(8)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hits, setHits] = useState<RetrievedChunk[] | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await retrievalApi.search(workspaceId, query.trim(), topK)
      setHits(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <PageHeader
        title="Search"
        description="Raw retrieval without the chat model. Useful for checking what the index actually returns."
      />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <Surface>
        <form className="grid gap-4 p-5 md:grid-cols-[1fr_6rem_auto]" onSubmit={(e) => void onSubmit(e)}>
          <Field label="Query">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} required />
          </Field>
          <Field label="Top K">
            <Input
              type="number"
              min={1}
              max={20}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !query.trim()}>
              {busy ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </form>
      </Surface>
      <div className="mt-6 space-y-3">
        {hits && hits.length === 0 ? (
          <EmptyState title="No chunks" body="Nothing matched. Upload documents and wait until they are Ready." />
        ) : null}
        {hits?.map((hit) => (
          <Surface key={hit.chunkId}>
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{hit.documentName}</p>
                <Badge tone="neutral">score {hit.score.toFixed(3)}</Badge>
                {hit.pageNumber != null ? <Badge>p.{hit.pageNumber}</Badge> : null}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink/70 dark:text-white/60">{hit.content}</p>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  )
}
