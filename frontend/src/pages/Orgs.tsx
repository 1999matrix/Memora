import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { TopBar } from '../components/shell'
import { Alert, Button, EmptyState, Field, Input, PageHeader, Select, Skeleton, Surface } from '../components/ui'
import { orgsApi, workspacesApi } from '../lib/api'
import { errorMessage } from '../lib/client'
import { formatDate, fullName } from '../lib/format'
import type { OrganizationRole } from '../types'

export function OrgsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: () => orgsApi.list() })

  const create = useMutation({
    mutationFn: () => orgsApi.create(name.trim()),
    onSuccess: (org) => {
      void qc.invalidateQueries({ queryKey: ['orgs'] })
      navigate(`/orgs/${org.id}`)
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <div className="min-h-[100dvh] bg-paper dark:bg-[#0e1116]">
      <TopBar title="Organizations" />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader
          title="Organizations"
          description="Pick a tenant, then open a workspace to chat over its knowledge."
        />
        {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-3">
            {orgs.isLoading ? (
              <Skeleton className="h-24" />
            ) : orgs.data?.items.length ? (
              orgs.data.items.map((org) => (
                <Link key={org.id} to={`/orgs/${org.id}`} className="block">
                  <Surface>
                    <div className="flex items-center justify-between px-5 py-4">
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-ink/45 dark:text-white/40">{org.slug}</p>
                      </div>
                      <p className="text-xs text-ink/45">{formatDate(org.createdAt)}</p>
                    </div>
                  </Surface>
                </Link>
              ))
            ) : (
              <EmptyState title="No organizations yet" body="Create one to start adding workspaces and documents." />
            )}
          </div>
          <Surface>
            <form
              className="space-y-4 p-5"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                setError('')
                create.mutate()
              }}
            >
              <h2 className="font-semibold">New organization</h2>
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
              </Field>
              <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
                Create
              </Button>
            </form>
          </Surface>
        </div>
      </div>
    </div>
  )
}

export function OrgWorkspacesPage() {
  const { orgId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const org = useQuery({ queryKey: ['org', orgId], queryFn: () => orgsApi.get(orgId), enabled: Boolean(orgId) })
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list(1, 100),
  })

  const mine = workspaces.data?.items.filter((w) => w.organizationId === orgId) ?? []

  const create = useMutation({
    mutationFn: () => workspacesApi.create({ name: name.trim(), description: description || undefined, organizationId: orgId }),
    onSuccess: (ws) => {
      void qc.invalidateQueries({ queryKey: ['workspaces'] })
      navigate(`/w/${ws.id}/chat`)
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <div className="min-h-[100dvh] bg-paper dark:bg-[#0e1116]">
      <TopBar title={org.data?.name ?? 'Workspace'} />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader
          title={org.data?.name ?? 'Workspaces'}
          description="Each workspace has its own documents, connectors, and conversations."
          actions={
            <Link to={`/orgs/${orgId}/settings`}>
              <Button variant="secondary">Organization settings</Button>
            </Link>
          }
        />
        {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-3">
            {workspaces.isLoading ? <Skeleton className="h-24" /> : null}
            {mine.map((ws) => (
              <button
                key={ws.id}
                type="button"
                className="block w-full text-left"
                onClick={() => navigate(`/w/${ws.id}/chat`)}
              >
                <Surface>
                  <div className="px-5 py-4">
                    <p className="font-medium">{ws.name}</p>
                    <p className="mt-1 text-sm text-ink/50 dark:text-white/45">
                      {ws.description || 'No description'}
                    </p>
                  </div>
                </Surface>
              </button>
            ))}
            {!workspaces.isLoading && mine.length === 0 ? (
              <EmptyState title="No workspaces" body="Create a workspace to upload documents and start chatting." />
            ) : null}
          </div>
          <Surface>
            <form
              className="space-y-4 p-5"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                setError('')
                create.mutate()
              }}
            >
              <h2 className="font-semibold">New workspace</h2>
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Description">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Button type="submit" disabled={create.isPending || !name.trim()}>
                Create
              </Button>
            </form>
          </Surface>
        </div>
      </div>
    </div>
  )
}

export function OrgSettingsPage() {
  const { orgId = '' } = useParams()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<OrganizationRole, 'OWNER'>>('MEMBER')
  const [error, setError] = useState('')

  const org = useQuery({
    queryKey: ['org', orgId],
    queryFn: async () => {
      const o = await orgsApi.get(orgId)
      setName(o.name)
      return o
    },
    enabled: Boolean(orgId),
  })
  const members = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => orgsApi.members(orgId),
    enabled: Boolean(orgId),
  })

  const save = useMutation({
    mutationFn: () => orgsApi.update(orgId, name.trim()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['org', orgId] }),
    onError: (err) => setError(errorMessage(err)),
  })
  const invite = useMutation({
    mutationFn: () => orgsApi.addMember(orgId, { email: email.trim(), role }),
    onSuccess: () => {
      setEmail('')
      void qc.invalidateQueries({ queryKey: ['org-members', orgId] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <div className="min-h-[100dvh] bg-paper dark:bg-[#0e1116]">
      <TopBar title="Organization settings" />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PageHeader
          title="Organization settings"
          description="Rename the organization and invite people who already have a Memora account."
          actions={
            <Link to={`/orgs/${orgId}`}>
              <Button variant="secondary">Back</Button>
            </Link>
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
              <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} />
            </Field>
            <Button type="submit" disabled={save.isPending || org.isLoading}>
              Save name
            </Button>
          </form>
        </Surface>
        <h2 className="mt-10 mb-4 text-lg font-semibold">Members</h2>
        <Surface>
          <div className="divide-y divide-ink/8 dark:divide-white/8">
            {members.data?.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{fullName(m.user)}</p>
                  <p className="text-xs text-ink/45">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    onChange={(e) => {
                      void orgsApi
                        .updateMember(orgId, m.userId, e.target.value as OrganizationRole)
                        .then(() => qc.invalidateQueries({ queryKey: ['org-members', orgId] }))
                        .catch((err) => setError(errorMessage(err)))
                    }}
                  >
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </Select>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void orgsApi
                        .removeMember(orgId, m.userId)
                        .then(() => qc.invalidateQueries({ queryKey: ['org-members', orgId] }))
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
              invite.mutate()
            }}
          >
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as Exclude<OrganizationRole, 'OWNER'>)}>
                <option value="ADMIN">Admin</option>
                <option value="MEMBER">Member</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={invite.isPending}>
                Invite
              </Button>
            </div>
          </form>
        </Surface>
      </div>
    </div>
  )
}
