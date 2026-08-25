import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Alert, Button, Field, Input, Surface } from '../components/ui'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/client'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/orgs')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-4 dark:bg-[#0e1116]">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 block text-center text-lg font-semibold tracking-tight">
          Memora
        </Link>
        <Surface>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-5 p-6 sm:p-8">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
              <p className="mt-1 text-sm text-ink/55 dark:text-white/50">Use your work email and password.</p>
            </div>
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Email">
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </Field>
            <Button className="w-full" disabled={busy} type="submit">
              {busy ? 'Signing in...' : 'Sign in'}
            </Button>
            <p className="text-center text-sm text-ink/55 dark:text-white/50">
              No account?{' '}
              <Link className="font-medium text-accent" to="/register">
                Create one
              </Link>
            </p>
          </form>
        </Surface>
      </div>
    </div>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register({ email, password, firstName, lastName })
      navigate('/orgs')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-4 py-10 dark:bg-[#0e1116]">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 block text-center text-lg font-semibold tracking-tight">
          Memora
        </Link>
        <Surface>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-5 p-6 sm:p-8">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Create account</h1>
              <p className="mt-1 text-sm text-ink/55 dark:text-white/50">You can create an organization after signing in.</p>
            </div>
            {error ? <Alert>{error}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </Field>
              <Field label="Last name">
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </Field>
            </div>
            <Field label="Email">
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </Field>
            <Button className="w-full" disabled={busy} type="submit">
              {busy ? 'Creating...' : 'Create account'}
            </Button>
            <p className="text-center text-sm text-ink/55 dark:text-white/50">
              Already have an account?{' '}
              <Link className="font-medium text-accent" to="/login">
                Sign in
              </Link>
            </p>
          </form>
        </Surface>
      </div>
    </div>
  )
}
