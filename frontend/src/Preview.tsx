import { useQuery } from 'convex/react'
import { api } from '@backend/_generated/api'
import { ArrowRight, Check, Paperclip, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useSurface } from './surface'
import {
  CASE_STATUS,
  Chip,
  RailCard,
  STEP_STATUS,
  Story,
  TheirDeadline,
  money,
  when,
} from './App'

/**
 * One real claim, readable with no account.
 *
 * The board is signed-in only and should stay that way — it hands out handover
 * tokens, and a token is a credential. But a stranger still has to be able to
 * see what this actually is, so `cases.preview` serves one opted-in case with
 * the tokens, the addresses and the file links taken out on the server.
 *
 * Deliberately its own screen rather than a flag threaded through `CaseView`:
 * the authenticated board is the part that must not break, and the safest way
 * to guarantee that is not to touch it. The shared pieces below — the status
 * words, the chips, the deadline block, the story — are imported, so the two
 * screens cannot drift apart in how they read.
 */
export default function Preview() {
  useSurface('dark')
  const c = useQuery(api.cases.preview, {})

  return (
    <div className="dark min-h-dvh bg-ink text-paper">
      <header className="sticky top-0 z-20 border-b border-hair bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-6 lg:px-10">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/brand/mark-light.webp" alt="" className="size-6" />
            <span className="font-display text-[17px] font-semibold tracking-tight">Outwait</span>
          </a>
          <Button asChild variant="ghost" className="ml-auto rounded-full ring-1 ring-hair">
            <a href="/board">
              Open your own board
              <ArrowRight />
            </a>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-6 pb-24 lg:px-10">
        {c === undefined && <PreviewSkeleton />}
        {c === null && (
          <p className="pt-20 text-[15px] text-dim">
            There is no claim on show right now. Try the{' '}
            <a href="/#check" className="underline underline-offset-4 hover:text-paper">
              policy reader
            </a>{' '}
            instead.
          </p>
        )}
        {c && <Claim c={c} />}
      </main>
    </div>
  )
}

type Preview = NonNullable<ReturnType<typeof useQuery<typeof api.cases.preview>>>

function Claim({ c }: { c: Preview }) {
  const s = CASE_STATUS[c.status] ?? CASE_STATUS.working
  const days = Math.max(1, Math.round((Date.now() - c.openedAt) / 86400000))
  const done = c.tracks.filter((t) => t.state === 'done').length

  return (
    <>
      {/* Said once, at the top, before anything else is read. */}
      <div className="mt-8 rounded-2xl border border-hair bg-ink-700 px-5 py-4">
        <p className="text-[14.5px] leading-relaxed">
          <span className="font-medium">This is a real claim, on an invented company.</span>{' '}
          <span className="text-dim">
            Sunvale Estates does not exist — we will not put a made-up claim against a real
            business on a public page. Everything the agent did is real: the emails were sent and
            received through AgentMail, the browser session was a real Firecrawl session a person
            typed a password into, and the account it registered is its own. Names and addresses
            are hidden because this page has no sign-in.
          </span>
        </p>
      </div>

      <h1 className="font-display mt-7 text-[32px] leading-tight font-semibold tracking-tight">
        {c.title}
      </h1>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-8">
          {c.summary && (
            <p className="max-w-[72ch] text-[16px] leading-relaxed text-paper/80">{c.summary}</p>
          )}

          {c.promise && (
            <TheirDeadline promise={c.promise} deadline={c.deadline} openedAt={c.openedAt} />
          )}

          {c.tracks.length > 0 && (
            <section className="mt-9">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[13px] font-medium text-dim">What's happening</h2>
                <span className="text-[13px] text-dim">
                  {done} of {c.tracks.length} finished
                </span>
              </div>
              <ol className="mt-4">
                {c.tracks.map((t, i) => {
                  const st = STEP_STATUS[t.state] ?? STEP_STATUS.ready
                  const last = i === c.tracks.length - 1
                  return (
                    <li key={t._id} className="relative flex gap-4 pb-6 last:pb-0">
                      {!last && (
                        <span
                          aria-hidden
                          className="absolute top-7 bottom-0 left-[13px] w-px bg-hair"
                        />
                      )}
                      <span
                        className={`relative z-10 grid size-[27px] shrink-0 place-items-center rounded-full ${
                          t.state === 'done'
                            ? 'bg-emerald-500 text-ink'
                            : t.state === 'blocked'
                              ? 'bg-amber-500 text-ink'
                              : t.state === 'running'
                                ? 'bg-sky-500 text-ink'
                                : 'border border-hair bg-ink-700'
                        }`}
                      >
                        {t.state === 'done' ? (
                          <Check className="size-3.5" strokeWidth={3} />
                        ) : (
                          <span
                            className={`size-1.5 rounded-full ${
                              t.state === 'ready' ? 'bg-white/30' : 'bg-white'
                            }`}
                          />
                        )}
                      </span>

                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="text-[16px] font-medium">{t.label}</p>
                          <Chip tone={st.tone}>{st.label}</Chip>
                        </div>
                        {t.detail && (
                          <p className="mt-1 max-w-[70ch] text-[14.5px] leading-relaxed text-dim">
                            {t.detail}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          {c.events.length > 0 && <Story events={c.events} />}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-span-4">
          <RailCard>
            <p className="text-[13px] font-medium text-dim">They owe you</p>
            <p className="font-display mt-2 text-[32px] leading-none font-semibold tracking-tight">
              {money(c.amount, c.currency)}
            </p>
            <div className="mt-4">
              <Chip tone={s.tone}>{s.label}</Chip>
            </div>
            <dl className="mt-5 space-y-2.5 border-t border-hair pt-4 text-[14px]">
              {[
                ['Company', c.company.name],
                ['Reference', c.reference ?? '—'],
                ['Open for', `${days} days`],
                ['Last moved', when(c.lastMovedAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 text-dim">{k}</dt>
                  <dd className="min-w-0 truncate text-right font-medium" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </RailCard>

          {(c.fileCount > 0 || c.memberCount > 1) && (
            <RailCard>
              <p className="text-[13px] font-medium text-dim">On this claim</p>
              <div className="mt-3 space-y-2.5 text-[14px]">
                {c.fileCount > 0 && (
                  <p className="flex items-center gap-2.5">
                    <Paperclip className="size-4 shrink-0 text-dim" />
                    {c.fileCount} {c.fileCount === 1 ? 'file' : 'files'} sent in
                    <span className="text-dim">— hidden here</span>
                  </p>
                )}
                {c.memberCount > 1 && (
                  <p className="flex items-center gap-2.5">
                    <Users className="size-4 shrink-0 text-dim" />
                    {c.memberCount} people share it
                  </p>
                )}
              </div>
            </RailCard>
          )}

          <RailCard>
            <p className="text-[15px] font-medium">Got one of your own?</p>
            <p className="mt-1 text-[14px] leading-relaxed text-dim">
              Forward the last email they sent you. There is no form to fill in.
            </p>
            <Button asChild variant="outline" className="mt-4 w-full rounded-full">
              <a href="/board">Open the board</a>
            </Button>
          </RailCard>
        </aside>
      </div>
    </>
  )
}

function PreviewSkeleton() {
  return (
    <div className="pt-8">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="mt-7 h-9 w-[24rem] max-w-full" />
      <div className="mt-8 grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-3 lg:col-span-8">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-6 h-40 w-full rounded-xl" />
        </div>
        <div className="lg:col-span-4">
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
