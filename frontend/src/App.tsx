import { useState } from 'react'
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '@backend/_generated/api'
import type { Id } from '@backend/_generated/dataModel'
import { ArrowLeft, ArrowRight, Check, ChevronRight, LogOut, Mail } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import SignIn from './SignIn'
import { useSurface } from './surface'
import { useView, type View } from './nav'

const INBOX = 'outwait@agentmail.to'

/* --- plain English -------------------------------------------------------- */

/**
 * Everything a person reads here is a sentence, not a status code.
 *
 * The person using this is owed money, is not technical, and opens the app to
 * find out two things: is anything happening, and does it need me. So the words
 * do that work — no RUNNING, no BLOCKED, no "2/5 steps".
 */
type Tone = 'good' | 'busy' | 'you' | 'quiet'

const CASE_STATUS: Record<string, { label: string; tone: Tone }> = {
  intake: { label: 'Reading your email', tone: 'busy' },
  working: { label: 'Working on it', tone: 'busy' },
  waiting_on_them: { label: 'Waiting for them to reply', tone: 'quiet' },
  waiting_on_you: { label: 'Needs you', tone: 'you' },
  won: { label: 'You got your money back', tone: 'good' },
  closed: { label: 'Closed', tone: 'quiet' },
}

const STEP_STATUS: Record<string, { label: string; tone: Tone }> = {
  done: { label: 'Done', tone: 'good' },
  running: { label: 'Happening now', tone: 'busy' },
  blocked: { label: 'Needs you', tone: 'you' },
  ready: { label: 'Up next', tone: 'quiet' },
  abandoned: { label: 'Stopped', tone: 'quiet' },
}

const TONE: Record<Tone, { chip: string; dot: string }> = {
  good: { chip: 'bg-emerald-500/12 text-emerald-300', dot: 'bg-emerald-400' },
  busy: { chip: 'bg-sky-500/12 text-sky-300', dot: 'bg-sky-400' },
  you: { chip: 'bg-amber-500/14 text-amber-300', dot: 'bg-amber-400' },
  quiet: { chip: 'bg-white/6 text-dim', dot: 'bg-white/30' },
}

/** Time the way a person says it, not the way a log prints it. */
function when(at: number) {
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

const SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', INR: '₹' }

function money(amount?: number, currency?: string) {
  if (amount === undefined) return null
  return `${currency ? (SYMBOL[currency] ?? currency + ' ') : ''}${amount.toLocaleString()}`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/* --- shell ---------------------------------------------------------------- */

function App() {
  return (
    <>
      <AuthLoading>
        <Shell me="">
          <HomeSkeleton />
        </Shell>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <Board />
      </Authenticated>
    </>
  )
}

function Board() {
  const [view, go] = useView()
  const me = useQuery(api.users.me)

  return (
    <Shell me={me?.email ?? ''}>
      {view.name === 'case' ? <CaseView id={view.id} go={go} /> : <Home go={go} />}
    </Shell>
  )
}

/**
 * A real window width, not a phone column down the middle of a monitor.
 *
 * The content sits on a 12-column grid: the thing you are reading takes the
 * left two thirds, and the things you glance at — what is owed, what needs you,
 * who the company is — live in a right rail that is always in view.
 */
function Shell({ me, children }: { me: string; children: React.ReactNode }) {
  useSurface('dark')

  return (
    <div className="dark min-h-dvh bg-ink text-paper">
      <header className="sticky top-0 z-20 border-b border-hair bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-6 lg:px-10">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/brand/mark-light.webp" alt="" className="size-6" />
            <span className="font-display text-[17px] font-semibold tracking-tight">
              Outwait
            </span>
          </a>

          {me && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-auto flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-white/8">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-paper text-[11px] font-medium text-ink">
                      {me.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronRight className="size-3.5 rotate-90 text-white/35" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5">
                  <p className="text-[13px] font-medium">Signed in as</p>
                  <p className="truncate text-[13px] text-dim">{me}</p>
                </div>
                <SignOutItem />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-6 pb-24 lg:px-10">{children}</main>
    </div>
  )
}

function SignOutItem() {
  const { signOut } = useAuthActions()
  return (
    <DropdownMenuItem onClick={() => void signOut()}>
      <LogOut />
      Sign out
    </DropdownMenuItem>
  )
}

/* --- bits ----------------------------------------------------------------- */

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium ${TONE[tone].chip}`}
    >
      <span className={`size-1.5 rounded-full ${TONE[tone].dot}`} />
      {children}
    </span>
  )
}

function Doodle({ name, className = '' }: { name: string; className?: string }) {
  // Drawn white for the dark ground, so it needs no treatment here.
  return (
    <img
      src={`/brand/doodle-${name}.webp`}
      alt=""
      aria-hidden
      className={`pointer-events-none select-none opacity-70 ${className}`}
    />
  )
}

/** A right-rail block. Quiet by default — these are glanced at, not read. */
function RailCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="gap-0 rounded-2xl border-hair bg-ink-700 py-0 shadow-none">
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  )
}

function NeedsYou({
  items,
  onOpenCase,
  compact = false,
}: {
  items: Array<Record<string, any>>
  onOpenCase?: (id: string) => void
  compact?: boolean
}) {
  return (
    <Card className="gap-0 rounded-2xl border-amber-500/25 bg-amber-500/8 py-0 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {!compact && (
            <Doodle name="tap" className="mt-0.5 hidden h-12 w-auto shrink-0 xl:block" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-amber-300">
              {items.length === 1 ? 'One thing needs you' : `${items.length} things need you`}
            </p>
            {items.map((a) => (
              <div key={a._id} className="mt-3 first:mt-2">
                <p className="text-[16px] leading-snug font-medium">{a.question}</p>
                {a.why && (
                  <p className="mt-1 text-[14px] leading-relaxed text-dim">{a.why}</p>
                )}
                {a.sendsTo && (
                  <p className="mt-1.5 text-[14px] text-dim">
                    It only goes to {a.sendsTo} if you say yes.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {a.href ? (
                    <Button asChild className="rounded-full">
                      <a href={a.href}>
                        Open it
                        <ArrowRight />
                      </a>
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-[14px] text-dim">
                      <Mail className="size-4" />
                      Just reply to the email we sent you
                    </span>
                  )}
                  {onOpenCase && a.caseTitle && (
                    <button
                      onClick={() => onOpenCase(a.caseId)}
                      className="text-[14px] text-dim underline-offset-4 hover:text-paper hover:underline"
                    >
                      {a.caseTitle}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* --- home ----------------------------------------------------------------- */

function Home({ go }: { go: (v: View) => void }) {
  const data = useQuery(api.cases.board)
  if (!data) return <HomeSkeleton />
  if (data.cases.length === 0) return <NoCases />

  const owed = data.cases.reduce((sum, c) => sum + (c.amount ?? 0), 0)
  const currency = data.cases.find((c) => c.currency)?.currency
  const oldest = Math.min(...data.cases.map((c) => c.openedAt ?? c.lastMovedAt))
  const days = Math.max(1, Math.round((Date.now() - oldest) / 86400000))
  const open = data.cases.filter((c) => c.status !== 'won' && c.status !== 'closed').length
  const won = data.cases.filter((c) => c.status === 'won').length

  return (
    <>
      <section className="pt-10">
        <h1 className="font-display text-[30px] leading-tight font-semibold tracking-tight">
          {greeting()}.
        </h1>
        <p className="mt-2 max-w-[70ch] text-[17px] leading-relaxed text-dim">
          We're chasing <span className="font-medium text-paper">{money(owed, currency)}</span>{' '}
          for you across {data.cases.length} {data.cases.length === 1 ? 'claim' : 'claims'}.
          We've been at it for {days} days.
        </p>
      </section>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        {/* What you read */}
        <div className="lg:col-span-8">
          <h2 className="text-[13px] font-medium text-dim">
            Your {data.cases.length === 1 ? 'claim' : 'claims'}
          </h2>

          <div className="mt-3 space-y-3">
            {data.cases.map((c) => {
              const s = CASE_STATUS[c.status] ?? CASE_STATUS.working
              const total = c.tracks.length
              const done = c.tracks.filter((t: Record<string, any>) => t.state === 'done').length
              return (
                <button
                  key={c._id}
                  onClick={() => go({ name: 'case', id: c._id })}
                  className="group block w-full rounded-2xl border border-hair bg-ink-700 p-5 text-left transition-colors hover:border-white/20"
                >
                  {/* Wide rows: the money and the progress get their own columns
                      instead of stacking, which is what the phone layout did. */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-medium tracking-tight">{c.title}</p>
                      <p className="mt-0.5 text-[14.5px] text-dim">{c.company.name}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Chip tone={s.tone}>{s.label}</Chip>
                        <span className="text-[13.5px] text-dim">
                          last moved {when(c.lastMovedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 sm:w-[190px]">
                      <p className="font-display text-[20px] font-semibold tracking-tight sm:text-right">
                        {money(c.amount, c.currency)}
                      </p>
                      {total > 0 && (
                        <div className="mt-3">
                          <Progress
                            value={(done / total) * 100}
                            className="h-1.5 bg-white/10 [&>[data-slot=progress-indicator]]:bg-emerald-400"
                          />
                          <p className="mt-2 text-[13px] text-dim sm:text-right">
                            {done} of {total} finished
                          </p>
                        </div>
                      )}
                    </div>

                    <ChevronRight className="hidden size-4 shrink-0 self-center text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-paper/60 sm:block" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* What you glance at */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-span-4">
          {data.waiting.length > 0 ? (
            <NeedsYou items={data.waiting} onOpenCase={(id) => go({ name: 'case', id })} />
          ) : (
            <RailCard>
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/12 text-emerald-400">
                  <Check className="size-4" />
                </span>
                <div>
                  <p className="text-[15px] font-medium">Nothing needs you</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-dim">
                    Everything is moving on its own. We'll email you the moment that changes.
                  </p>
                </div>
              </div>
            </RailCard>
          )}

          <RailCard>
            <p className="text-[13px] font-medium text-dim">The money</p>
            <p className="font-display mt-2 text-[30px] leading-none font-semibold tracking-tight">
              {money(owed, currency)}
            </p>
            <dl className="mt-5 space-y-2.5 text-[14px]">
              {[
                ['Still open', `${open} ${open === 1 ? 'claim' : 'claims'}`],
                ['Won back', `${won} ${won === 1 ? 'claim' : 'claims'}`],
                ['Oldest claim', `${days} days`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <dt className="text-dim">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </RailCard>

          <RailCard>
            <p className="text-[15px] font-medium">Got another one?</p>
            <p className="mt-1 text-[14px] leading-relaxed text-dim">
              Forward us the last email they sent you. You don't have to fill anything in.
            </p>
            <Button asChild variant="outline" className="mt-4 w-full rounded-full">
              <a href={`mailto:${INBOX}`}>
                <Mail />
                Forward an email
              </a>
            </Button>
          </RailCard>
        </aside>
      </div>
    </>
  )
}

/* --- one claim ------------------------------------------------------------ */

function CaseView({ id, go }: { id: string; go: (v: View) => void }) {
  const c = useQuery(api.cases.get, { caseId: id as Id<'cases'> })
  if (c === undefined) return <CaseSkeleton />

  if (c === null) {
    return (
      <div className="pt-16 text-center">
        <p className="text-[17px] font-medium">We can't find that claim</p>
        <p className="mt-2 text-[15px] text-dim">It may have been closed.</p>
        <Button className="mt-6 rounded-full" onClick={() => go({ name: 'cases' })}>
          Back to your claims
        </Button>
      </div>
    )
  }

  const s = CASE_STATUS[c.status] ?? CASE_STATUS.working
  const days = Math.max(1, Math.round((Date.now() - c.openedAt) / 86400000))
  const done = c.tracks.filter((t) => t.state === 'done').length

  return (
    <>
      <button
        onClick={() => go({ name: 'cases' })}
        className="mt-8 inline-flex items-center gap-2 text-[14px] text-dim transition-colors hover:text-paper"
      >
        <ArrowLeft className="size-4" />
        Your claims
      </button>

      <h1 className="font-display mt-5 text-[32px] leading-tight font-semibold tracking-tight">
        {c.title}
      </h1>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-8">
          {c.summary && (
            <p className="max-w-[72ch] text-[16px] leading-relaxed text-paper/80">
              {c.summary}
            </p>
          )}

          {c.waiting.length > 0 && (
            <div className="mt-6 lg:hidden">
              <NeedsYou items={c.waiting} compact />
            </div>
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
                      {/* The line that makes a list read as a journey. */}
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
          {c.waiting.length > 0 && (
            <div className="hidden lg:block">
              <NeedsYou items={c.waiting} compact />
            </div>
          )}

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

          {c.evidence.length > 0 && (
            <RailCard>
              <p className="text-[13px] font-medium text-dim">What you've sent in</p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                {c.evidence.map((f) =>
                  f.url && f.kind === 'photo' ? (
                    <a key={f._id} href={f.url} target="_blank" rel="noreferrer" title={f.name}>
                      <img
                        src={f.url}
                        alt={f.name}
                        className="size-14 rounded-xl border border-hair object-cover"
                      />
                    </a>
                  ) : (
                    <a
                      key={f._id}
                      href={f.url ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      title={f.name}
                      className="inline-flex h-14 max-w-full items-center rounded-xl border border-hair bg-ink-700 px-4 text-[14px] text-paper/80 transition-colors hover:border-white/25"
                    >
                      <span className="truncate">{f.name}</span>
                    </a>
                  ),
                )}
              </div>
            </RailCard>
          )}
        </aside>
      </div>
    </>
  )
}

/**
 * The full log is the proof the agent really did the work, so it stays — but
 * behind a click. Nobody opens a refund app to read forty lines of history.
 */
function Story({ events }: { events: Array<{ _id: string; text: string; at: number }> }) {
  const [open, setOpen] = useState(false)
  const shown = open ? events : events.slice(0, 5)
  const hidden = events.length - shown.length

  return (
    <section className="mt-10">
      <h2 className="text-[13px] font-medium text-dim">Everything that's happened</h2>
      <ol className="mt-3 space-y-3">
        {shown.map((e) => (
          <li key={e._id} className="flex gap-3">
            <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-white/25" />
            <p className="max-w-[80ch] text-[14.5px] leading-relaxed text-paper/80">
              {e.text} <span className="text-white/35">· {when(e.at)}</span>
            </p>
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 text-[14px] font-medium text-dim underline-offset-4 hover:text-paper hover:underline"
        >
          Show everything else ({hidden})
        </button>
      )}
    </section>
  )
}

/* --- empty + loading ------------------------------------------------------ */

function NoCases() {
  return (
    <div className="pt-20 text-center">
      <Doodle name="envelopes" className="mx-auto h-28 w-auto" />
      <h1 className="font-display mt-6 text-[26px] font-semibold tracking-tight">
        Nothing here yet
      </h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-[16px] leading-relaxed text-dim">
        Forward us the last email they sent you and we'll take it from there. You don't have to
        fill anything in — we read the email and start chasing.
      </p>
      <Button asChild className="mt-6 rounded-full">
        <a href={`mailto:${INBOX}`}>
          <Mail />
          Forward an email
        </a>
      </Button>
      <p className="mt-3 text-[14px] text-dim">{INBOX}</p>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="pt-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-5 w-full max-w-[36rem]" />
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-3 lg:col-span-8">
          <Skeleton className="h-4 w-24" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] w-full rounded-2xl" />
          ))}
        </div>
        <div className="space-y-4 lg:col-span-4">
          <Skeleton className="h-[120px] w-full rounded-2xl" />
          <Skeleton className="h-[190px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

function CaseSkeleton() {
  return (
    <div className="pt-8" aria-busy="true" aria-label="Loading the claim">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-5 h-9 w-[24rem] max-w-full" />
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-8">
          <Skeleton className="h-5 w-full max-w-[62ch]" />
          <Skeleton className="mt-9 h-4 w-32" />
          <div className="mt-4 space-y-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="size-[27px] shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-56 max-w-full" />
                  <Skeleton className="h-3.5 w-80 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 lg:col-span-4">
          <Skeleton className="h-[230px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

export default App
