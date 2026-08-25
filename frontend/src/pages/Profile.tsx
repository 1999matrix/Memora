import { useState, type FormEvent } from 'react'

import { TopBar } from '../components/shell'
import { Alert, Button, Field, Input, PageHeader, Surface } from '../components/ui'
import { usersApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/client'

export function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved('')
    setBusy(true)
    try {
      await usersApi.updateMe({
        firstName,
        lastName,
        ...(password ? { password } : {}),
      })
      setPassword('')
      await refreshUser()
      setSaved('Saved')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-paper dark:bg-[#0e1116]">
      <TopBar title="Profile" />
      <div className="mx-auto max-w-lg px-6 py-10">
        <PageHeader title="Profile" description="Update your name or password." />
        {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
        {saved ? <p className="mb-4 text-sm text-accent">{saved}</p> : null}
        <Surface>
          <form className="space-y-4 p-5" onSubmit={(e) => void onSubmit(e)}>
            <Field label="Email">
              <Input value={user?.email ?? ''} disabled />
            </Field>
            <Field label="First name">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </Field>
            <Field label="New password" hint="Leave blank to keep the current password.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
            </Field>
            <p className="text-xs text-ink/45">Role: {user?.role}</p>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </form>
        </Surface>
      </div>
    </div>
  )
}
