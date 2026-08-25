import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'

import { TopBar } from '../components/shell'
import { Alert, Button, Field, Input, PageHeader, Skeleton, Surface } from '../components/ui'
import { adminApi, workspacesApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/client'
import { usd } from '../lib/format'

export function AdminPage() {
  const { user } = useAuth()
  const [evalWorkspace, setEvalWorkspace] = useState('')
  const [error, setError] = useState('')
  const [evalNote, setEvalNote] = useState('')

  const dash = useQuery({ queryKey: ['admin-dash'], queryFn: () => adminApi.dashboard() })
  const runs = useQuery({ queryKey: ['eval-runs'], queryFn: () => adminApi.evalRuns() })
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => workspacesApi.list(1, 100) })

  const runEval = useMutation({
    mutationFn: () => adminApi.runEval(evalWorkspace),
    onSuccess: (res) => {
      setEvalNote(`Run ${res.runId} finished`)
      void runs.refetch()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  if (user && user.role !== 'SUPER_ADMIN') return <Navigate to="/orgs" replace />

  const d = dash.data

  return (
    <div className="min-h-[100dvh] bg-paper dark:bg-[#0e1116]">
      <TopBar title="Platform" />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <PageHeader
          title="Platform admin"
          description="Visible only to SUPER_ADMIN. Costs and eval runs reflect current backend instrumentation."
        />
        {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
        {dash.isLoading ? <Skeleton className="h-40" /> : null}
        {d ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Users', String(d.totalUsers)],
              ['Active 24h', String(d.activeUsers)],
              ['Organizations', String(d.organizations)],
              ['Workspaces', String(d.workspaces)],
              ['Documents', String(d.documents)],
              ['Chunks', String(d.indexedChunks)],
              ['Queries 24h', String(d.queries24h)],
              ['Avg latency', `${Math.round(d.averageLatencyMs)} ms`],
            ].map(([label, value]) => (
              <Surface key={label}>
                <div className="px-5 py-4">
                  <p className="text-xs text-ink/45">{label}</p>
                  <p className="mt-1 font-mono text-xl">{value}</p>
                </div>
              </Surface>
            ))}
          </div>
        ) : null}
        {d ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Surface>
              <div className="p-5">
                <h2 className="font-semibold">Costs</h2>
                <p className="mt-2 text-sm text-ink/55">Monthly {usd(d.costs.monthlyCost)}</p>
                <p className="mt-1 font-mono text-xs text-ink/45">Tokens {d.costs.tokenUsage}</p>
                <p className="mt-3 text-sm">Redis {d.redisOk ? 'up' : 'down'}</p>
              </div>
            </Surface>
            <Surface>
              <div className="p-5">
                <h2 className="font-semibold">Connector health</h2>
                <ul className="mt-3 space-y-1 text-sm">
                  {Object.entries(d.connectorHealth.byStatus).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="font-mono">{v}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink/45">Failed jobs {d.connectorHealth.failedJobs}</p>
              </div>
            </Surface>
          </div>
        ) : null}
        <h2 className="mt-10 mb-4 text-lg font-semibold">Evaluation</h2>
        {evalNote ? <p className="mb-3 text-sm text-accent">{evalNote}</p> : null}
        <Surface>
          <form
            className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              setError('')
              runEval.mutate()
            }}
          >
            <Field label="Workspace">
              <Input
                list="eval-ws"
                value={evalWorkspace}
                onChange={(e) => setEvalWorkspace(e.target.value)}
                required
              />
              <datalist id="eval-ws">
                {workspaces.data?.items.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </datalist>
            </Field>
            <Button type="submit" disabled={runEval.isPending}>
              Run eval
            </Button>
          </form>
        </Surface>
        <div className="mt-4 space-y-2">
          {runs.data?.map((run) => (
            <Surface key={run.id}>
              <div className="px-5 py-4 text-sm">
                <p className="font-medium">{run.name}</p>
                <p className="mt-1 font-mono text-xs text-ink/45">{run.id}</p>
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  )
}
