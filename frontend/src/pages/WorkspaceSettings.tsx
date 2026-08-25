import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Alert, Button, Field, Input, PageHeader, Select, Surface } from '../components/ui'
import { feedbackApi, workspacesApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/client'
import { formatDateTime, fullName } from '../lib/format'
import type { WorkspaceRole } from '../types'

export function WorkspaceSettingsPage() {
  const { workspaceId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('MEMBER')
  const [error, setError] = useState('')

  const ws = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => {
      const w = await workspacesApi.get(workspaceId)
      setName(w.name)
      setDescription(w.description ?? '')
      return w
    },
    enabled: Boolean(workspaceId),
  })
  const members = useQuery({
    queryKey: ['ws-members', workspaceId],
    queryFn: () => workspacesApi.members(workspaceId),
    enabled: Boolean(workspaceId),
  })
  const feedback = useQuery({
    queryKey: ['feedback', workspaceId],
    queryFn: () => feedbackApi.list(workspaceId),
    enabled: Boolean(workspaceId),
  })

  const save = useMutation({
    mutationFn: () => workspacesApi.update(workspaceId, { name: name.trim(), description }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <PageHeader
        title="Workspace settings"
        description="Admins can rename the workspace and invite existing users by email."
        actions={
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm('Delete this workspace?')) return
              void workspacesApi
                .remove(workspaceId)
                .then(() => navigate(ws.data ? `/orgs/${ws.data.organizationId}` : '/orgs'))
                .catch((err) => setError(errorMessage(err)))
            }}
          >
            Delete workspace
          </Button>
        }
      />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <Surface>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </form>
      </Surface>
      <h2 className="mt-10 mb-4 text-lg font-semibold">Members</h2>
      <Surface>
        <div className="divide-y divide-ink/8 dark:divide-white/8">
          {members.data?.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-medium">
                  {fullName(m.user)}
                  {m.userId === user?.id ? ' (you)' : ''}
                </p>
                <p className="text-xs text-ink/45">{m.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={m.role}
                  onChange={(e) => {
                    void workspacesApi
                      .updateMember(workspaceId, m.userId, e.target.value as WorkspaceRole)
                      .then(() => qc.invalidateQueries({ queryKey: ['ws-members', workspaceId] }))
                      .catch((err) => setError(errorMessage(err)))
                  }}
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                </Select>
                <Button
                  variant="ghost"
                  onClick={() => {
                    void workspacesApi
                      .removeMember(workspaceId, m.userId)
                      .then(() => qc.invalidateQueries({ queryKey: ['ws-members', workspaceId] }))
                      .catch((err) => setError(errorMessage(err)))
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
        <form
          className="grid gap-3 border-t border-ink/8 p-5 sm:grid-cols-[1fr_8rem_auto] dark:border-white/8"
          onSubmit={(e) => {
            e.preventDefault()
            void workspacesApi
              .addMember(workspaceId, { email: email.trim(), role })
              .then(() => {
                setEmail('')
                void qc.invalidateQueries({ queryKey: ['ws-members', workspaceId] })
              })
              .catch((err) => setError(errorMessage(err)))
          }}
        >
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
              <option value="ADMIN">Admin</option>
              <option value="MEMBER">Member</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit">Invite</Button>
          </div>
        </form>
      </Surface>
      <h2 className="mt-10 mb-4 text-lg font-semibold">Recent feedback</h2>
      <Surface>
        <div className="divide-y divide-ink/8 dark:divide-white/8">
          {feedback.data?.length ? (
            feedback.data.slice(0, 20).map((f) => (
              <div key={f.id} className="px-5 py-3 text-sm">
                <p className="font-medium">{f.rating}</p>
                {f.comment ? <p className="mt-1 text-ink/60">{f.comment}</p> : null}
                <p className="mt-1 text-xs text-ink/40">{formatDateTime(f.createdAt)}</p>
              </div>
            ))
          ) : (
            <p className="px-5 py-8 text-sm text-ink/50">No feedback yet.</p>
          )}
        </div>
      </Surface>
    </div>
  )
}
