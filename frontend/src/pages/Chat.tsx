import {
  PaperPlaneTilt,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash,
} from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Alert, Badge, Button, EmptyState, Skeleton } from '../components/ui'
import { chatApi, feedbackApi } from '../lib/api'
import { streamChat } from '../lib/chat-stream'
import { errorMessage } from '../lib/client'
import { cn, relativeTime } from '../lib/format'
import type { ChatCitation, FeedbackRating, Message } from '../types'

function conversationLabel(c: { title: string | null; messages: { content: string }[] }) {
  if (c.title) return c.title
  const last = c.messages[0]?.content || c.messages.at(-1)?.content
  if (last) return last.slice(0, 48)
  return 'New conversation'
}

export function ChatPage() {
  const { workspaceId = '', conversationId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const listRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState('')
  const [citations, setCitations] = useState<ChatCitation[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const conversations = useQuery({
    queryKey: ['conversations', workspaceId],
    queryFn: () => chatApi.conversations(workspaceId),
    enabled: Boolean(workspaceId),
  })

  const thread = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => chatApi.get(conversationId!),
    enabled: Boolean(conversationId),
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [thread.data, streaming])

  async function send() {
    const message = draft.trim()
    if (!message || busy) return
    setDraft('')
    setError('')
    setBusy(true)
    setStreaming('')
    setCitations([])
    let nextId = conversationId
    try {
      await streamChat(workspaceId, { message, conversationId: nextId }, (event) => {
        if (event.type === 'meta') {
          nextId = event.conversationId
          setCitations(event.citations)
          if (!conversationId) {
            navigate(`/w/${workspaceId}/chat/${event.conversationId}`, { replace: true })
          }
        } else if (event.type === 'token') {
          setStreaming((s) => s + event.content)
        } else if (event.type === 'error') {
          setError(event.message)
        }
      })
      setStreaming('')
      void qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
      if (nextId) void qc.invalidateQueries({ queryKey: ['conversation', nextId] })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const messages: Message[] = thread.data?.messages ?? []

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-ink/8 bg-surface/70 dark:border-white/8 dark:bg-[#12161c] lg:flex">
        <div className="flex items-center justify-between px-3 py-3">
          <p className="text-sm font-medium">Conversations</p>
          <Button variant="ghost" onClick={() => navigate(`/w/${workspaceId}/chat`)}>
            <Plus size={16} />
            New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {conversations.isLoading ? <Skeleton className="mx-1 h-12" /> : null}
          {conversations.data?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/w/${workspaceId}/chat/${c.id}`)}
              className={cn(
                'mb-1 w-full rounded-xl px-3 py-2.5 text-left text-sm transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                c.id === conversationId
                  ? 'bg-accent-soft text-ink dark:bg-accent/20 dark:text-white'
                  : 'hover:bg-ink/5 dark:hover:bg-white/6',
              )}
            >
              <span className="line-clamp-2">{conversationLabel(c)}</span>
              <span className="mt-1 block text-[11px] text-ink/40 dark:text-white/35">{relativeTime(c.updatedAt)}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-ink/8 px-4 py-3 dark:border-white/8">
          <div>
            <p className="text-sm font-medium">Chat</p>
            <p className="text-xs text-ink/45 dark:text-white/40">
              Answers stream with citations. Quality is placeholder until live models are wired.
            </p>
          </div>
          {conversationId ? (
            <Button
              variant="ghost"
              onClick={() => {
                void chatApi.remove(conversationId).then(() => {
                  void qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
                  navigate(`/w/${workspaceId}/chat`)
                })
              }}
            >
              <Trash size={16} />
              Delete
            </Button>
          ) : null}
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {error ? <Alert>{error}</Alert> : null}
            {!conversationId && !streaming && !busy ? (
              <EmptyState
                title="Ask the workspace"
                body="Questions search indexed documents. Start a thread, then keep going in the same conversation."
              />
            ) : null}
            {thread.isLoading && conversationId ? <Skeleton className="h-24" /> : null}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {streaming ? (
              <div className="rounded-2xl bg-ink/4 px-4 py-3 text-sm leading-relaxed dark:bg-white/6">
                {streaming}
                <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-accent align-middle" />
              </div>
            ) : null}
            {citations.length > 0 && streaming ? <CitationList citations={citations} /> : null}
          </div>
        </div>
        <form
          className="border-t border-ink/8 p-4 dark:border-white/8"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.25rem] bg-ink/4 p-1.5 ring-1 ring-ink/6 dark:bg-white/5 dark:ring-white/8">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder="Ask a question"
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none"
            />
            <Button type="submit" disabled={busy || !draft.trim()} className="shrink-0">
              <PaperPlaneTilt size={16} weight="fill" />
              Send
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function CitationList({ citations }: { citations: ChatCitation[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {citations.map((c) => (
        <Badge key={`${c.chunkId}-${c.index}`} tone="neutral">
          [{c.index}] {c.documentName}
          {c.pageNumber != null ? ` p.${c.pageNumber}` : ''}
        </Badge>
      ))}
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'USER'
  const [fbError, setFbError] = useState('')
  const [sent, setSent] = useState<FeedbackRating | null>(null)

  async function rate(rating: FeedbackRating) {
    setFbError('')
    try {
      await feedbackApi.create(message.id, { rating })
      setSent(rating)
    } catch (err) {
      setFbError(errorMessage(err))
    }
  }

  const citations = Array.isArray(message.citations) ? message.citations : []

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-ink text-white dark:bg-white dark:text-ink'
            : 'bg-ink/4 text-ink dark:bg-white/6 dark:text-white',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && citations.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {citations.map((c) => (
              <span key={`${c.chunkId}-${c.index}`} className="text-[11px] opacity-70">
                [{c.index}] {c.documentName}
              </span>
            ))}
          </div>
        ) : null}
        {!isUser && message.role === 'ASSISTANT' ? (
          <div className="mt-3 flex items-center gap-1">
            <button
              type="button"
              aria-label="Helpful"
              className={cn('rounded-lg p-1.5 hover:bg-black/10 dark:hover:bg-white/10', sent === 'UP' && 'text-accent')}
              onClick={() => void rate('UP')}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              type="button"
              aria-label="Not helpful"
              className={cn('rounded-lg p-1.5 hover:bg-black/10 dark:hover:bg-white/10', sent === 'DOWN' && 'text-danger')}
              onClick={() => void rate('DOWN')}
            >
              <ThumbsDown size={14} />
            </button>
            {fbError ? <span className="text-[11px] text-danger">{fbError}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
