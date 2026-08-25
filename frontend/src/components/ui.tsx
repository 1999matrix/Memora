import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

import { cn } from '../lib/format'

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'secondary' &&
          'bg-ink/5 text-ink ring-1 ring-ink/8 hover:bg-ink/8 dark:bg-white/8 dark:text-white dark:ring-white/10 dark:hover:bg-white/12',
        variant === 'ghost' && 'text-ink/70 hover:bg-ink/5 hover:text-ink dark:text-white/70 dark:hover:bg-white/8',
        variant === 'danger' && 'bg-danger text-white hover:bg-danger/90',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-ink dark:text-white">{label}</span>
      {children}
      {hint && !error ? <span className="text-xs text-ink/50 dark:text-white/45">{hint}</span> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-[10px] bg-white px-3 text-sm text-ink ring-1 ring-ink/10 placeholder:text-ink/35 outline-none transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:ring-2 focus:ring-accent dark:bg-white/5 dark:text-white dark:ring-white/12 dark:placeholder:text-white/35',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-[10px] bg-white px-3 py-2.5 text-sm text-ink ring-1 ring-ink/10 placeholder:text-ink/35 outline-none transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:ring-2 focus:ring-accent dark:bg-white/5 dark:text-white dark:ring-white/12',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-[10px] bg-white px-3 text-sm text-ink ring-1 ring-ink/10 outline-none focus:ring-2 focus:ring-accent dark:bg-white/5 dark:text-white dark:ring-white/12',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-[1.25rem] bg-ink/4 p-1.5 ring-1 ring-ink/6 dark:bg-white/5 dark:ring-white/8', className)}>
      <div className="rounded-[calc(1.25rem-0.25rem)] bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#141820] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        {children}
      </div>
    </div>
  )
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide',
        tone === 'neutral' && 'bg-ink/8 text-ink/70 dark:bg-white/10 dark:text-white/70',
        tone === 'good' && 'bg-accent-soft text-accent dark:bg-accent/20 dark:text-[#9ad4c7]',
        tone === 'warn' && 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
        tone === 'bad' && 'bg-red-100 text-danger dark:bg-red-500/15 dark:text-red-200',
        tone === 'accent' && 'bg-accent text-white',
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-1 py-10">
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-ink/55 dark:text-white/50">{body}</p>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-ink/8 dark:bg-white/10', className)} />
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/55 dark:text-white/50">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-danger ring-1 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/20">
      {children}
    </div>
  )
}
