import { useEffect, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '@backend/_generated/api'
import { WhoIsDriving } from './Presence'
import { meOrGuest } from './identity'

/**
 * BOUNDARY 3 — the handover page.
 *
 * The browser session is created when this page asks for it, and not a second
 * earlier. Firecrawl sessions live 10 minutes, hard, and the live-view URL dies
 * with the session — so a session opened when the email was sent would always
 * be dead by the time someone taps the link.
 */
export default function Handover({ token }: { token: string }) {
  const handoff = useQuery(api.handoffs.byToken, { token })
  const open = useAction(api.handoffs.open)
  const finish = useAction(api.handoffs.finish)

  const [url, setUrl] = useState<string | null>(null)
  const [watchUrl, setWatchUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [done, setDone] = useState(false)
  const [left, setLeft] = useState<number | null>(null)
  const [me] = useState(() => meOrGuest())

  // Count the session down out loud. Ten minutes is not long, and a person
  // deserves to know rather than watch it die.
  useEffect(() => {
    if (!url) return
    const iv = setInterval(() => {
      setLeft((prev) => (prev === null ? null : Math.max(0, prev - 1)))
    }, 1000)
    return () => clearInterval(iv)
  }, [url])

  async function start() {
    setOpening(true)
    setError(null)
    try {
      const res = await open({ token })
      if (!res.ok) setError(res.reason)
      else {
        setUrl(res.interactiveLiveViewUrl ?? null)
        setWatchUrl(res.liveViewUrl ?? null)
        setLeft(Math.round((res.expiresAt - Date.now()) / 1000))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the browser.')
    } finally {
      setOpening(false)
    }
  }

  async function complete() {
    await finish({ token })
    setDone(true)
  }

  if (handoff === undefined) {
    return <Shell><p className="text-stone-400">Loading…</p></Shell>
  }
  if (handoff === null) {
    return <Shell><p>That link is not valid.</p></Shell>
  }
  if (handoff.expired || handoff.state === 'expired') {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">This link has expired</h1>
        <p className="mt-2 text-stone-600">
          Nothing is lost. The agent is still working the case and will send a fresh link.
        </p>
      </Shell>
    )
  }
  if (done || handoff.state === 'done') {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Done. Thank you.</h1>
        <p className="mt-2 text-stone-600">
          The login is saved against {handoff.company ?? 'this company'}. I will not need to
          ask you again.
        </p>
        <p className="mt-1 text-sm text-stone-500">You can close this tab.</p>
      </Shell>
    )
  }

  return (
    <Shell wide={!!url}>
      <p className="text-xs uppercase tracking-wide text-stone-400">{handoff.caseTitle}</p>
      <h1 className="mt-1 text-2xl font-semibold">{handoff.reason}</h1>

      {!url && (
        <>
          <p className="mt-3 max-w-xl text-stone-600">
            I have filled in everything I can. The only part left is the password, and I am
            not asking you for it — you type it straight into the browser below and I carry
            on from there.
          </p>
          <p className="mt-2 max-w-xl text-sm text-stone-500">
            The browser starts when you press this, so nothing has been sitting open waiting
            for you.
          </p>
          <button
            onClick={start}
            disabled={opening}
            className="mt-5 rounded-lg bg-stone-900 px-5 py-2.5 text-white disabled:opacity-50"
          >
            {opening ? 'Starting the browser…' : 'Open the browser'}
          </button>
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        </>
      )}

      {url && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="text-sm text-stone-600">
              Type the password in the frame. Nobody else can see it — it renders as dots on
              every other screen.
            </p>
            <WhoIsDriving roomId={`handover:${token}`} me={me} />
            {left !== null && (
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">
                session ends in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </span>
            )}
          </div>

          <iframe
            src={url}
            title="handover"
            className="mt-4 h-[620px] w-full rounded-xl border border-stone-300 bg-white"
          />

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={complete}
              className="rounded-lg bg-stone-900 px-5 py-2.5 text-white"
            >
              I am logged in — carry on
            </button>
            {watchUrl && (
              <a
                href={watchUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-stone-500 underline"
              >
                read-only view for everyone else
              </a>
            )}
          </div>
        </>
      )}
    </Shell>
  )
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      <div className={`mx-auto px-6 py-10 ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <p className="mb-6 text-sm font-semibold">Outwait</p>
        {children}
      </div>
    </main>
  )
}
