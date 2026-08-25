import type { ChatSseEvent } from '../types'
import { API_V1, getAccessToken } from './client'

export async function streamChat(
  workspaceId: string,
  body: { message: string; conversationId?: string },
  onEvent: (event: ChatSseEvent) => void,
  signal?: AbortSignal,
) {
  const token = getAccessToken()
  const res = await fetch(`${API_V1}/workspaces/${workspaceId}/chat`, {
    method: 'POST',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'x-correlation-id': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`Chat failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      onEvent(JSON.parse(line.slice(6)) as ChatSseEvent)
    }
  }
}
