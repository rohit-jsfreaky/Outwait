import { useQuery } from 'convex/react'
import { api } from '@backend/_generated/api'

const INBOX = 'outwait@agentmail.to'

function ago(at: number) {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function money(amount?: number, currency?: string) {
  if (amount === undefined) return null
  const sym: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }
  return `${currency ? (sym[currency] ?? currency + ' ') : ''}${amount.toLocaleString()}`
}

const trackTone: Record<string, string> = {
  ready: 'text-stone-500',
  running: 'text-emerald-700',
  blocked: 'text-amber-700',
  done: 'text-stone-400 line-through',
  abandoned: 'text-stone-400 line-through',
}

const statusLabel: Record<string, string> = {
  intake: 'reading it',
  working: 'working',
  waiting_on_them: 'waiting on them',
  waiting_on_you: 'waiting on you',
  won: 'won',
  closed: 'closed',
}

function App() {
  const data = useQuery(api.cases.board)

  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Outwait</h1>
            <p className="mt-1 text-stone-600">They wait you out. Outwait waits longer.</p>
          </div>
          <div className="text-sm text-stone-500">
            Forward an email to{' '}
            <span className="rounded bg-stone-200 px-1.5 py-0.5 font-mono text-stone-800">
              {INBOX}
            </span>
          </div>
        </header>

        {data === undefined ? (
          <p className="mt-12 text-stone-400">Connecting…</p>
        ) : data.cases.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <p className="text-stone-700">No cases yet.</p>
            <p className="mt-2 text-sm text-stone-500">
              Forward the last email they sent you to{' '}
              <span className="font-mono">{INBOX}</span>. A case appears here on its own —
              you do not have to come back and fill anything in.
            </p>
          </div>
        ) : (
          <section className="mt-10 space-y-4">
            {data.cases.map((c) => (
              <article
                key={c._id}
                className="rounded-xl border border-stone-200 bg-white p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    {c.title}
                    {money(c.amount, c.currency) && (
                      <span className="ml-2 font-normal text-stone-500">
                        {money(c.amount, c.currency)}
                      </span>
                    )}
                  </h2>
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">
                    {statusLabel[c.status] ?? c.status}
                  </span>
                </div>

                <p className="mt-1 text-sm text-stone-500">
                  {c.company.name}
                  {c.reference ? ` · ref ${c.reference}` : ''} · moved {ago(c.lastMovedAt)}
                </p>

                {c.summary && <p className="mt-3 text-stone-700">{c.summary}</p>}

                {c.tracks.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-stone-100 pt-3 text-sm">
                    {c.tracks.map((t) => (
                      <li key={t._id} className="flex items-baseline gap-3">
                        <span className={`w-20 shrink-0 text-xs uppercase ${trackTone[t.state] ?? ''}`}>
                          {t.state}
                        </span>
                        <span className="text-stone-800">{t.label}</span>
                        {t.detail && <span className="text-stone-400">— {t.detail}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </section>
        )}

        {data && data.feed.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Live
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.feed.map((e) => (
                <li key={e._id} className="flex gap-3">
                  <span className="w-16 shrink-0 text-stone-400">{ago(e.at)}</span>
                  <span className="text-stone-700">{e.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}

export default App
