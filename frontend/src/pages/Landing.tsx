import { ArrowUpRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

import { TopBar } from '../components/shell'

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-paper text-ink dark:bg-[#0e1116] dark:text-[#e8eaed]">
      <TopBar title="" />
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-24 pt-10 lg:grid-cols-2 lg:items-center lg:pt-16">
        <div>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight leading-[1.1] md:text-5xl">
            Ask your company knowledge. Get cited answers.
          </h1>
          <p className="mt-5 max-w-[42ch] text-base leading-relaxed text-ink/60 dark:text-white/55">
            Memora indexes documents and connectors so teams can search, chat, and trace every claim back to a source.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent-hover active:scale-[0.98]"
            >
              Create account
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                <ArrowUpRight size={14} />
              </span>
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink/5 px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink/8 transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ink/8 dark:bg-white/8 dark:text-white dark:ring-white/10"
            >
              Sign in
            </Link>
          </div>
        </div>
        <div className="rounded-[1.5rem] bg-ink/4 p-1.5 ring-1 ring-ink/6 dark:bg-white/5 dark:ring-white/8">
          <div className="rounded-[calc(1.5rem-0.3rem)] bg-surface p-6 dark:bg-[#141820]">
            <p className="text-xs font-medium text-ink/45 dark:text-white/40">Workspace</p>
            <p className="mt-4 text-lg font-medium leading-snug">What is our refund policy for annual contracts?</p>
            <div className="mt-6 space-y-3 text-sm leading-relaxed text-ink/70 dark:text-white/60">
              <p>Annual contracts can be refunded within 14 days of renewal if unused seats remain.</p>
              <p className="text-xs text-accent">Source: Finance handbook, page 4</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-10 md:grid-cols-3">
          {[
            ['Documents', 'Upload PDF, DOCX, Markdown, and text. Indexing runs in the background.'],
            ['Connectors', 'Wire Drive, GitHub, Notion, Slack, and more. Sync is queued and observable.'],
            ['Governance', 'Org and workspace roles, feedback, cost analytics, and a platform admin view.'],
          ].map(([title, body]) => (
            <div key={title}>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/55 dark:text-white/50">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
