import { useState, type ReactNode } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '@backend/_generated/api'
import { ArrowRight, ArrowUpRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import DotGrid from '@/components/DotGrid'
import CountUp from '@/components/CountUp'

import { Reveal, SmoothScroll } from './motion'
import { useSurface } from './surface'

const INBOX = 'outwait@agentmail.to'
const MARK = '/brand/mark-light.webp'

/**
 * The landing page.
 *
 * The product's only real subject is elapsed time, so the page is built around
 * a field of dots that only moves when you do and a counter that keeps going
 * while you read. Everything is black, white and grey — the single amber chip
 * on the board is the only colour in the whole product, which is what makes it
 * mean something.
 */
export default function Landing({ onOpen }: { onOpen: () => void }) {
  useSurface('dark')
  return (
    <div className="bg-ink text-paper">
      <SmoothScroll />
      <Hero onOpen={onOpen} />
      <Ledger />
      <TheTrick />
      <CheckItYourself />
      <Boundaries />
      <TheBoard />
      <EmailFirst />
      <Limits />
      <Closing onOpen={onOpen} />
    </div>
  )
}

/* --- layout --------------------------------------------------------------- */

function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1180px] px-6 ${className}`}>{children}</div>
}

function Section({
  children,
  id,
  className = '',
}: {
  children: ReactNode
  id?: string
  className?: string
}) {
  return (
    <section id={id} className={`border-t border-hair py-24 sm:py-32 ${className}`}>
      {children}
    </section>
  )
}

/** Every section is numbered. The page reads like a case file, not a pitch. */
function Eyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p
      className="flex items-baseline gap-3 font-mono text-[11px] tracking-[0.2em] text-dim uppercase"
      data-reveal
    >
      <span className="text-paper/30">{n}</span>
      {children}
    </p>
  )
}

function Doodle({ name, className = '' }: { name: string; className?: string }) {
  return (
    <img
      src={`/brand/doodle-${name}.webp`}
      alt=""
      aria-hidden
      loading="lazy"
      className={`pointer-events-none select-none opacity-70 ${className}`}
    />
  )
}

/* --- hero ----------------------------------------------------------------- */

function Hero({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="relative isolate min-h-[100svh] overflow-hidden">
      {/* Dots that only wake up where the cursor is. Flat, no gradient. */}
      <div className="absolute inset-0 opacity-90">
        <DotGrid
          dotSize={3}
          gap={30}
          baseColor="#1F1F22"
          activeColor="#FAFAFA"
          proximity={130}
          shockRadius={230}
          shockStrength={4}
          returnDuration={1.4}
        />
      </div>

      <div className="pointer-events-none relative flex min-h-[100svh] flex-col">
        <Nav onOpen={onOpen} />

        <Container className="flex flex-1 flex-col justify-center py-16">
          <div className="pointer-events-auto max-w-[900px]">
            <h1
              className="font-display text-[clamp(44px,7.4vw,96px)] leading-[0.94] font-medium tracking-[-0.045em]"
              data-hero-line
            >
              They wait you out.
              <br />
              <span className="text-paper/45">Outwait waits longer.</span>
            </h1>

            <p
              className="mt-8 max-w-[52ch] text-[18px] leading-[1.5] text-dim"
              data-hero-line
            >
              Nobody ever refuses you. They just keep adding steps until you decide it is not
              worth your evening. This is the thing that keeps going after you stop.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3" data-hero-line>
              <Button
                size="lg"
                onClick={onOpen}
                className="h-12 rounded-full bg-paper px-7 text-[15px] font-medium text-ink hover:bg-paper/85"
              >
                Open the board
                <ArrowRight />
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-12 rounded-full px-7 text-[15px] font-medium text-paper/70 ring-1 ring-hair hover:bg-paper/5 hover:text-paper"
              >
                <a href={`mailto:${INBOX}`}>Forward an email instead</a>
              </Button>
            </div>
          </div>
        </Container>

        <Container className="pointer-events-auto pb-10">
          <p className="font-mono text-[11px] tracking-[0.18em] text-paper/25 uppercase">
            Scroll — one real claim, day 1 to day 47
          </p>
        </Container>
      </div>
    </div>
  )
}

function Nav({ onOpen }: { onOpen: () => void }) {
  return (
    <Container className="pointer-events-auto flex items-center justify-between py-6">
      <a href="/" className="flex items-center gap-2.5">
        <img src={MARK} alt="" className="size-6" />
        <span className="text-[17px] font-medium tracking-tight">Outwait</span>
      </a>

      <nav className="hidden items-center gap-9 font-mono text-[11px] tracking-[0.16em] text-dim uppercase md:flex">
        <a href="#ledger" className="transition-colors hover:text-paper">
          The wait
        </a>
        <a href="#trick" className="transition-colors hover:text-paper">
          The trick
        </a>
        <a href="#check" className="transition-colors hover:text-paper">
          Check it
        </a>
        <a href="#boundaries" className="transition-colors hover:text-paper">
          Where you stand
        </a>
      </nav>

      <Button
        onClick={onOpen}
        variant="ghost"
        className="rounded-full px-5 text-paper/80 ring-1 ring-hair hover:bg-paper/5 hover:text-paper"
      >
        Open the board
      </Button>
    </Container>
  )
}

/* --- the ledger ----------------------------------------------------------- */

const ROWS: Array<{ day: number; who: string; what: string; you: boolean }> = [
  { day: 1, who: 'you', what: 'Forward one email. That is the whole setup.', you: true },
  { day: 1, who: 'it', what: 'Reads the forward, opens the case, writes to them.', you: false },
  { day: 8, who: 'it', what: 'Nothing back. Writes again.', you: false },
  { day: 15, who: 'it', what: 'Registers on the claims portal in its own name.', you: false },
  { day: 22, who: 'you', what: 'Ten seconds: approve the letter it drafted.', you: true },
  { day: 31, who: 'it', what: 'Files with the ombudsman. Keeps chasing.', you: false },
  { day: 47, who: 'them', what: 'They pay.', you: false },
]

/** The whole case as a ledger. You appear on exactly two of the seven rows. */
function Ledger() {
  return (
    <Section id="ledger">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow n="01">The wait, in full</Eyebrow>
            <h2
              className="font-display mt-5 max-w-[16ch] text-[clamp(30px,4.2vw,50px)] leading-[1.02] font-medium tracking-[-0.035em]"
              data-reveal
            >
              Seven weeks. You show up twice.
            </h2>
          </div>
          <Doodle name="calendar" className="hidden h-28 w-auto sm:block" />
        </div>

        <Reveal className="mt-14">
          <div>
            {ROWS.map((r) => (
              <div
                key={`${r.day}-${r.what}`}
                className="grid grid-cols-[72px_1fr] items-baseline gap-5 border-t border-hair py-6 last:border-b sm:grid-cols-[110px_90px_1fr]"
                data-reveal
              >
                <span className="font-mono text-[12px] tracking-[0.14em] text-dim uppercase">
                  Day {String(r.day).padStart(2, '0')}
                </span>
                <span
                  className={`hidden font-mono text-[11px] tracking-[0.16em] uppercase sm:block ${
                    r.you ? 'text-paper' : 'text-paper/30'
                  }`}
                >
                  {r.who}
                </span>
                <span
                  className={`text-[17px] leading-snug ${r.you ? 'text-paper' : 'text-dim'}`}
                >
                  {r.what}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}

/* --- the trick ------------------------------------------------------------ */

function TheTrick() {
  const steps = [
    ['Fill in the online form', 'Most people get this far.'],
    ['Wait ten working days', 'A third stop here.'],
    ['Send the same document again', 'Half of the rest stop here.'],
    ['Please call us between 10 and 4', 'Almost everyone stops here.'],
    ['Escalate in writing to another team', 'Nobody is left to.'],
  ]

  return (
    <Section id="trick">
      <Container>
        <div className="grid items-start gap-14 md:grid-cols-[0.85fr_1.15fr] md:gap-20">
          <div className="md:sticky md:top-24">
            <Eyebrow n="02">The trick</Eyebrow>
            <h2
              className="font-display mt-5 text-[clamp(30px,4.2vw,50px)] leading-[1.02] font-medium tracking-[-0.035em]"
              data-reveal
            >
              Nobody ever says no.
            </h2>
            <p className="mt-6 max-w-[38ch] text-[17px] leading-[1.55] text-dim" data-reveal>
              They price the refund in your time instead, and keep raising the price. It costs
              them nothing and it works on almost everybody.
            </p>
            <p className="mt-5 max-w-[38ch] text-[17px] leading-[1.55]" data-reveal>
              Outwait pays that price for you. It is not cleverer than them. It is just still
              there in week six.
            </p>
            <Doodle name="telephone" className="mt-10 h-24 w-auto" />
          </div>

          <Reveal>
            <ol>
              {steps.map(([step, drop], i) => (
                <li
                  key={step}
                  className="flex items-baseline gap-6 border-t border-hair py-6 last:border-b"
                  data-reveal
                >
                  <span className="font-mono text-[12px] text-paper/25">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px]">{step}</span>
                    <span className="mt-1 block text-[14px] text-dim">{drop}</span>
                  </span>
                  {/* Attrition, drawn as a bar that runs out. */}
                  <span aria-hidden className="hidden h-px w-24 shrink-0 bg-hair sm:block">
                    <span
                      className="block h-px bg-paper/70"
                      style={{ width: `${100 - i * 21}%` }}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}

/* --- boundaries ----------------------------------------------------------- */

/* --- check it yourself ---------------------------------------------------- */

/** Companies that publish a turnaround, so the thing has something to find. */
const TRY = ['argos.co.uk', 'currys.co.uk', 'ryanair.com']

type Result = Awaited<ReturnType<ReturnType<typeof useAction<typeof api.policy.read>>>>

function sayPromise(p: { days: number; unit: string }) {
  const noun =
    p.unit === 'working'
      ? 'working day'
      : p.unit === 'week'
        ? 'week'
        : p.unit === 'month'
          ? 'month'
          : 'day'
  return `${p.days} ${noun}${p.days === 1 ? '' : 's'}`
}

/**
 * The only thing on this page a stranger can make the agent actually go and do.
 *
 * Everything else here is us telling you something. This is the same code that
 * runs on a real claim, pointed at a company you choose, reading their live
 * page while you wait — and then showing you the sentence and the link, so the
 * first thing you can do is click through and find it still there.
 *
 * It is allowed to come back with nothing, and it says so plainly when it does.
 * A page that does not publish a number is the ordinary case, and inventing one
 * would break the only thing this section is for.
 */
function CheckItYourself() {
  const read = useAction(api.policy.read)
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function go(value: string) {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    setResult(null)
    try {
      setResult(await read({ domain: v }))
    } catch {
      setResult({ ok: false, reason: 'That did not go through. Try again in a moment.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="check">
      <Container className="grid items-start gap-y-12 lg:grid-cols-12 lg:gap-x-16">
        {/* The drawing sits beside the question, not beside the answer — the
            result below can run long, and it should not drag the art down. */}
        <Doodle
          name="magnifier"
          className="col-start-1 row-start-1 hidden h-56 w-auto justify-self-end lg:col-span-4 lg:col-start-9 lg:mt-4 lg:block"
        />

        <div className="col-start-1 row-start-1 lg:col-span-8">
          <Eyebrow n="03">Check it yourself</Eyebrow>
          <h2
            className="font-display mt-5 max-w-[18ch] text-[clamp(30px,4.2vw,50px)] leading-[1.02] font-medium tracking-[-0.035em]"
            data-reveal
          >
            Do not take our word for it.
          </h2>
          <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-dim" data-reveal>
            Name a company you have actually dealt with. The same code that runs on a real claim
            will go and read their own pages, find the deadline they set themselves, and show you
            the sentence it came from. If they do not publish one, it will tell you that instead.
          </p>

          <div className="mt-10 max-w-[620px]" data-reveal>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void go(domain)
            }}
            className="flex flex-wrap items-center gap-3"
          >
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="argos.co.uk"
              aria-label="A company's website"
              spellCheck={false}
              autoCapitalize="off"
              className="h-12 min-w-0 flex-1 rounded-full border-hair bg-ink-700 px-5 text-[15px] placeholder:text-paper/25"
            />
            <Button
              type="submit"
              size="lg"
              disabled={busy}
              className="h-12 rounded-full bg-paper px-7 text-[15px] font-medium text-ink hover:bg-paper/85"
            >
              {busy && <Spinner />}
              {busy ? 'Reading their site…' : 'Read their policy'}
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-dim">
            <span>or try</span>
            {TRY.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDomain(d)
                  void go(d)
                }}
                className="rounded-full border border-hair px-3 py-1 font-mono text-[12px] transition-colors hover:border-paper/40 hover:text-paper"
              >
                {d}
              </button>
            ))}
          </div>

            <div aria-live="polite">
              {result && <ReadResult result={result} />}
            </div>
          </div>
        </div>

        {/* The ledger is a table, not an argument, so it takes the whole
            measure rather than sitting in the column the prose reads in. */}
        <div className="lg:col-span-12">
          <PolicyLedger />
        </div>
      </Container>
    </Section>
  )
}

/**
 * Everything this has been asked to read, and the finding underneath it.
 *
 * It is a live Convex query, so a lookup run above appears here a moment later
 * without a refresh — including yours. Nothing is loaded from a file: every
 * row is a page that was actually fetched, and every row that found something
 * links to where it found it.
 */
function PolicyLedger() {
  const data = useQuery(api.policy.ledger)
  if (!data || data.total < 6) return null

  const withPromise = data.rows.filter((r) => r.promise)
  const silent = data.rows.filter((r) => !r.promise)
  const ordered = [...withPromise, ...silent]

  return (
    <div className="mt-16 border-t border-hair pt-10">
      <p className="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">
        What it has read so far
      </p>

      <p className="font-display mt-5 max-w-[26ch] text-[clamp(22px,2.6vw,32px)] leading-[1.15] font-medium tracking-[-0.03em]">
        {data.silent} of {data.total} give you no number to hold them to.
      </p>

      <dl className="mt-7 flex flex-wrap gap-x-12 gap-y-5">
        {[
          [data.total, 'policies read'],
          [data.publish, 'publish a deadline'],
          [data.silent, 'publish nothing'],
          ...(data.medianDays ? [[`${data.medianDays} days`, 'the middle promise'] as const] : []),
        ].map(([n, label]) => (
          <div key={label}>
            <dt className="font-display text-[28px] leading-none font-semibold tracking-tight">
              {n}
            </dt>
            <dd className="mt-1.5 text-[13px] text-dim">{label}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-8 grid gap-x-10 gap-y-0 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.slice(0, 27).map((r) => (
          <li
            key={r.domain}
            className="flex items-baseline gap-3 border-b border-hair/60 py-2.5 text-[14px]"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-paper/80">
              {r.domain}
            </span>
            {r.promise ? (
              <a
                href={r.source ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 underline-offset-4 hover:underline"
              >
                {sayPromise(r.promise)}
              </a>
            ) : (
              <span className="shrink-0 text-dim">nothing published</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-5 max-w-[68ch] text-[13px] leading-relaxed text-dim">
        Every row is a live page, read by the same code that runs on a claim, on the company's own
        site. <span className="text-paper/70">Nothing published</span> means nothing it could find
        there — which is exactly what a customer finds. Add a company above and it joins this list
        without a refresh.
      </p>
    </div>
  )
}

function ReadResult({ result }: { result: Result }) {
  if (!result.ok) {
    return <p className="mt-8 text-[15px] text-dim">{result.reason}</p>
  }

  if (!result.promise) {
    return (
      <div className="mt-8 border-t border-hair pt-6">
        <p className="text-[17px] leading-relaxed">
          <span className="font-mono text-[15px]">{result.domain}</span> does not publish a
          deadline we can find.
        </p>
        <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-dim">
          That is the ordinary case, and it is worth knowing: with nothing published, the only
          promise on record is whatever they put in an email to you. So that is what a claim
          quotes back instead.
        </p>
        {result.source && (
          <a
            href={result.source}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[13px] text-dim underline-offset-4 hover:text-paper hover:underline"
          >
            the page it read
            <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="mt-8 border-t border-hair pt-6">
      <p className="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">
        {result.domain} gives itself
      </p>
      <p className="font-display mt-3 text-[clamp(34px,5vw,56px)] leading-none font-medium tracking-[-0.035em]">
        {sayPromise(result.promise)}
      </p>

      <blockquote className="mt-6 max-w-[62ch] border-l-2 border-hair pl-5 text-[16px] leading-relaxed text-paper/80">
        “{result.promise.quote}”
      </blockquote>

      <p className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-dim">
        {result.source && (
          <a
            href={result.source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline-offset-4 hover:text-paper hover:underline"
          >
            open the page and look
            <ArrowUpRight className="size-3.5" />
          </a>
        )}
        <span aria-hidden>·</span>
        <span>{result.cached ? 'read earlier, cached' : 'read just now'}</span>
      </p>

      <p className="mt-6 max-w-[54ch] text-[15px] leading-relaxed text-dim">
        On a real claim that number goes on the case with the date it runs out, and the sentence
        above is what gets quoted back at them.
      </p>
    </div>
  )
}

/* --- boundaries ----------------------------------------------------------- */

function Boundaries() {
  const rows = [
    {
      n: '01',
      doodle: 'form',
      title: 'It acts as itself',
      body: 'A complaints portal wants an account. It signs up with its own email address and reads its own verification code out of its own inbox. It never holds a credential of yours, because it never needs one.',
    },
    {
      n: '02',
      doodle: 'envelopes',
      title: 'It asks before it commits',
      body: 'Anything binding — a formal complaint, a number, a settlement — is written and then held. It does not go out until a person says yes, and there is no code path that sends it without one.',
    },
    {
      n: '03',
      doodle: 'tap',
      title: 'It hands you the wheel',
      body: 'When a step needs your login it does not ask for your password. It sends one link, a real browser opens on your phone, you type, and it carries on. One login per company, and it remembers.',
    },
  ]

  return (
    <Section id="boundaries">
      <Container>
        <Eyebrow n="04">Where you stand</Eyebrow>
        <h2
          className="font-display mt-5 max-w-[18ch] text-[clamp(30px,4.2vw,50px)] leading-[1.02] font-medium tracking-[-0.035em]"
          data-reveal
        >
          Every agent has a human.
        </h2>
        <p className="mt-6 max-w-[54ch] text-[17px] leading-[1.55] text-dim" data-reveal>
          The only question is where that human stands. Outwait answers it three times, and each
          answer is a line in the code rather than a promise in a prompt.
        </p>

        <Reveal className="mt-16">
          <div className="grid gap-px border border-hair bg-hair md:grid-cols-3">
            {rows.map(({ n, doodle, title, body }) => (
              <div key={n} className="bg-ink p-8" data-reveal>
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[12px] tracking-[0.16em] text-paper/25">
                    {n}
                  </span>
                  <Doodle name={doodle} className="h-16 w-auto" />
                </div>
                <h3 className="mt-8 text-[19px] font-medium tracking-tight">{title}</h3>
                <p className="mt-3 text-[15px] leading-[1.6] text-dim">{body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}

/* --- the board ------------------------------------------------------------ */

function TheBoard() {
  const tracks: Array<[string, string, string]> = [
    ['running', 'Write to Sunvale Estates', 'Got 1 file from you. That unblocks it.'],
    ['done', 'Read their own policy', 'Nothing published on their own site'],
    ['running', 'Register on the claims service', 'Registering in my own name'],
    ['blocked', 'File on the tenancy portal', 'Needs your login, not mine'],
    ['done', 'Find who they answer to', 'Consumer forum route found'],
  ]

  return (
    <Section id="board">
      <Container>
        <div className="max-w-[54ch]">
          <Eyebrow n="05">The board</Eyebrow>
          <h2
            className="font-display mt-5 text-[clamp(30px,4.2vw,50px)] leading-[1.02] font-medium tracking-[-0.035em]"
            data-reveal
          >
            You read it. You do not operate it.
          </h2>
          <p className="mt-6 text-[17px] leading-[1.55] text-dim" data-reveal>
            One screen, and the top of it is always the only thing left for a human. Everything
            below is the agent showing its working.
          </p>
        </div>

        <Reveal className="mt-16">
          <div className="overflow-hidden border border-hair bg-ink-700" data-reveal>
            <div className="flex items-center gap-3 border-b border-hair px-5 py-3.5 font-mono text-[11px] tracking-[0.14em] text-dim uppercase">
              outwait / sunvale deposit refund
              <span className="ml-auto flex items-center gap-2 text-[#43c39b]">
                <span className="size-1.5 rounded-full bg-[#43c39b]" />
                working · day 09
              </span>
            </div>

            <div className="grid sm:grid-cols-[1fr_290px]">
              <div className="p-6">
                {/* The one piece of colour in the entire product. */}
                <div className="border-l-2 border-[#e0b24e] bg-[#e0b24e]/8 px-4 py-4">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#e0b24e] uppercase">
                    Waiting on you
                  </p>
                  <p className="mt-2 text-[15px]">
                    Approve the formal deposit claim before I send it
                  </p>
                  <p className="mt-1 text-[13px] text-dim">
                    Goes to their tenant services address only if you say yes.
                  </p>
                </div>

                <div className="mt-7 flex items-baseline justify-between gap-3">
                  <p className="text-[17px] font-medium">
                    Sunvale deposit refund <span className="text-dim">₹45,000</span>
                  </p>
                  <span className="border border-[#e0b24e]/40 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-[#e0b24e] uppercase">
                    waiting on you
                  </span>
                </div>

                <ul className="mt-5">
                  {tracks.map(([state, label, detail]) => (
                    <li
                      key={label}
                      className="flex items-baseline gap-4 border-t border-hair py-3.5"
                    >
                      <span
                        className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
                          state === 'blocked'
                            ? 'text-[#e0b24e]'
                            : state === 'running'
                              ? 'text-[#43c39b]'
                              : 'text-paper/25'
                        }`}
                      >
                        {state === 'blocked' ? '••' : state === 'running' ? '▶' : '✓'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px]">{label}</span>
                        <span className="block text-[13px] text-dim">{detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-hair p-6 sm:border-t-0 sm:border-l">
                <p className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">Live</p>
                <ul className="mt-5 space-y-3.5 text-[13px]">
                  {[
                    ['2m', 'Sent you the draft. Held until you reply.'],
                    ['3m', 'Registered on the claims service in my own name.'],
                    ['3m', 'Read my own verification code. You were not involved.'],
                    ['1d', 'Wrote again. Nobody has replied yet.'],
                    ['8d', 'They went quiet. Finding out who they answer to.'],
                  ].map(([t, text]) => (
                    <li key={text} className="flex gap-3">
                      <span className="w-6 shrink-0 text-right font-mono text-[11px] text-paper/25">
                        {t}
                      </span>
                      <span className="text-dim">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}

/* --- email first ---------------------------------------------------------- */

function EmailFirst() {
  const asks: Array<[string, string]> = [
    ['A receipt', 'Reply with a photo. That is the whole job.'],
    ['A fact', 'One line back is enough.'],
    ['Approval', 'It shows you the letter. You say yes or no.'],
    ['A login', 'One tap, twenty seconds, on your own phone.'],
  ]

  return (
    <Section>
      <Container>
        <div className="grid items-start gap-14 md:grid-cols-2 md:gap-20">
          <div>
            <Eyebrow n="06">How it reaches you</Eyebrow>
            <h2
              className="font-display mt-5 text-[clamp(30px,4.2vw,50px)] leading-[1.02] font-medium tracking-[-0.035em]"
              data-reveal
            >
              It starts with a forward.
              <br />
              Not a form.
            </h2>
            <p className="mt-6 max-w-[40ch] text-[17px] leading-[1.55] text-dim" data-reveal>
              Someone who has given up on a deposit will never open a website again. But they
              will reply to an email from their phone in twenty seconds.
            </p>
            <p className="mt-5 max-w-[40ch] text-[17px] leading-[1.55] text-dim" data-reveal>
              So it never asks you to come back. One forward gives it their real address, the
              reference number, the dates and the whole history, for no effort at all.
            </p>

            <div className="mt-10 border border-hair p-5" data-reveal>
              <p className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">
                Forward the last email they sent you
              </p>
              <p className="mt-2 font-mono text-[15px] break-all">{INBOX}</p>
            </div>
          </div>

          <Reveal>
            <div className="flex items-start justify-between" data-reveal>
              <p className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">
                Everything it will ever ask you for
              </p>
              <Doodle name="cheque" className="h-14 w-auto" />
            </div>
            <ul className="mt-6">
              {asks.map(([k, v], i) => (
                <li
                  key={k}
                  className="flex items-baseline gap-6 border-t border-hair py-6 last:border-b"
                  data-reveal
                >
                  <span className="font-mono text-[12px] text-paper/25">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="block text-[17px]">{k}</span>
                    <span className="mt-1 block text-[14px] text-dim">{v}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-7 text-[14px] leading-[1.6] text-dim" data-reveal>
              That is the complete list. Four things, none longer than a sentence, spread over
              however many weeks it takes.
            </p>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}

/* --- limits --------------------------------------------------------------- */

function Limits() {
  const limits = [
    [
      'It needs a company with bad self-service',
      'Amazon already refunds you in two clicks. This is for the ones that do not.',
    ],
    [
      'A saved login lasts as long as their session does',
      'A bank may be minutes. A small tenancy portal may be months. It asks again when it has to.',
    ],
    [
      'It cannot make a phone call',
      'When a company insists on one, it puts the same thing in writing instead. Usually better, but it is a workaround.',
    ],
    [
      'It is not legal advice',
      'It never claims to be. The claim is only that it chases, and that it does not get bored.',
    ],
  ]

  return (
    <Section>
      <Container>
        <div className="grid items-start gap-14 md:grid-cols-[0.8fr_1.2fr] md:gap-20">
          <div>
            <Eyebrow n="07">Being straight with you</Eyebrow>
            <h2
              className="font-display mt-5 text-[clamp(28px,3.6vw,42px)] leading-[1.04] font-medium tracking-[-0.035em]"
              data-reveal
            >
              What it does not do.
            </h2>
          </div>

          <Reveal>
            <dl>
              {limits.map(([t, d]) => (
                <div key={t} className="border-t border-hair py-6 last:border-b" data-reveal>
                  <dt className="text-[17px]">{t}</dt>
                  <dd className="mt-2 text-[15px] leading-[1.6] text-dim">{d}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}

/* --- closing -------------------------------------------------------------- */

function Closing({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="relative isolate overflow-hidden border-t border-hair">
      <div className="absolute inset-0 opacity-60">
        <DotGrid
          dotSize={3}
          gap={30}
          baseColor="#1F1F22"
          activeColor="#FAFAFA"
          proximity={120}
          shockRadius={200}
          shockStrength={4}
          returnDuration={1.4}
        />
      </div>

      <Container className="pointer-events-none relative py-28 sm:py-36">
        <div className="pointer-events-auto">
          {/* The counter keeps going while you read the last line. */}
          <p className="font-display flex items-baseline gap-4 text-[clamp(56px,11vw,150px)] leading-[0.85] font-medium tracking-[-0.05em]">
            <CountUp to={47} from={1} duration={2.6} separator="" />
            <span className="font-sans text-[15px] font-normal tracking-normal text-dim">
              days, and still counting
            </span>
          </p>

          <h2
            className="font-display mt-14 max-w-[18ch] text-[clamp(30px,4.6vw,56px)] leading-[1.02] font-medium tracking-[-0.04em]"
            data-reveal
          >
            You cannot outsmart them. You outwait them.
          </h2>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-[1.6] text-dim" data-reveal>
            Forward one email, then go and live your life. It will write to you when it needs the
            ten seconds only you can give.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              onClick={onOpen}
              className="h-12 rounded-full bg-paper px-7 text-[15px] font-medium text-ink hover:bg-paper/85"
            >
              Open the board
              <ArrowRight />
            </Button>
            <a
              href={`mailto:${INBOX}`}
              className="group inline-flex items-center gap-2 rounded-full px-5 py-3 font-mono text-[13px] text-dim ring-1 ring-hair transition-colors hover:text-paper"
            >
              {INBOX}
              <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5" />
            </a>
          </div>

          <div className="mt-24 flex flex-wrap items-end justify-between gap-6 border-t border-hair pt-8">
            <div className="flex items-center gap-2.5">
              <img src={MARK} alt="" className="size-5" />
              <span className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">
                Built for the Convex All Gas Hackathon
              </span>
            </div>
            <span className="font-mono text-[11px] tracking-[0.16em] text-paper/25 uppercase">
              Convex · OpenAI · Firecrawl · AgentMail
            </span>
          </div>
        </div>
      </Container>
    </section>
  )
}
