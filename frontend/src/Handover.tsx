import { useEffect, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '@backend/_generated/api'
import { CheckCircle2, Clock3, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'

import { WhoIsDriving } from './Presence'
import { meOrGuest } from './identity'
import { useSurface } from './surface'

/**
 * BOUNDARY 3 — the handover page.
 *
 * The browser session is created when this page asks for it, and not a second
 * earlier. Firecrawl sessions live 10 minutes, hard, and the live-view URL dies
 * with the session — so a session opened when the email was sent would always
 * be dead by the time someone taps the link.
 */
export default function Handover({ token }: { token: string }) {
  useSurface('dark')
  const handoff = useQuery(api.handoffs.byToken, { token })
  const open = useAction(api.handoffs.open)
  const finish = useAction(api.handoffs.finish)

  const [url, setUrl] = useState<string | null>(null)
  const [watchUrl, setWatchUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [done, setDone] = useState(false)
  const [left, setLeft] = useState<number | null>(null)
  // This page is reachable without an account, on purpose — the token in the
  // URL is the credential and somebody just tapped a link on their phone. If
  // they happen to be signed in we use their real address; otherwise a guest
  // label is enough for "who is driving".
  const signedIn = useQuery(api.users.me)
  const [guest] = useState(() => meOrGuest())
  const me = signedIn?.email ?? guest

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
    return (
      <Shell>
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="mt-3 h-9 w-[22rem] max-w-full" />
        <Card className="mt-6 max-w-xl rounded-2xl border-hair bg-ink-700">
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-10 w-44 rounded-full" />
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (handoff === null) {
    return (
      <Shell>
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>That link is not valid.</AlertTitle>
          <AlertDescription>Check the email again, or ask for a fresh one.</AlertDescription>
        </Alert>
      </Shell>
    )
  }

  if (handoff.expired || handoff.state === 'expired') {
    return (
      <Shell>
        <Card className="rounded-2xl border-hair bg-ink-700">
          <CardHeader>
            <CardTitle className="font-display text-3xl">This link has expired</CardTitle>
            <CardDescription className="text-base">
              Nothing is lost. The agent is still working the case and will send a fresh link.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    )
  }

  if (done || handoff.state === 'done') {
    return (
      <Shell>
        <Card className="rounded-2xl border-hair bg-ink-700">
          <CardHeader>
            <CheckCircle2 className="mb-2 size-8 text-mint" />
            <CardTitle className="font-display text-3xl">Done. Thank you.</CardTitle>
            <CardDescription className="text-base">
              The login is saved against {handoff.company ?? 'this company'}. I will not need to
              ask you again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full">
              <a href="/board">Back to your claims</a>
            </Button>
            <p className="text-[14px] text-dim">or just close this tab.</p>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell wide={!!url}>
      <p className="text-[13px] text-dim">
        {handoff.caseTitle}
      </p>
      <h1 className="font-display mt-1 text-4xl tracking-tight">{handoff.reason}</h1>

      {!url && (
        <Card className="mt-6 max-w-xl rounded-2xl border-hair bg-ink-700">
          <CardContent className="space-y-3">
            <p className="leading-relaxed">
              I have filled in everything I can. The only part left is the password, and I am not
              asking you for it — you type it straight into the browser below and I carry on from
              there.
            </p>
            <p className="text-[15px] leading-relaxed text-dim">
              The browser starts when you press this, so nothing has been sitting open waiting
              for you.
            </p>
            <Button size="lg" onClick={start} disabled={opening} className="rounded-full">
              {opening && <Spinner />}
              {opening ? 'Starting the browser…' : 'Open the browser'}
            </Button>
            {error && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {url && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="text-[15px] text-dim">
              Type your password straight into the window below. Nobody else can see it — on
              every other screen it renders as dots.
            </p>
            <WhoIsDriving roomId={`handover:${token}`} me={me} />
            {left !== null && (
              <Badge className="gap-1.5 rounded-full bg-amber-soft font-mono text-amber">
                <Clock3 className="size-3" />
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
              </Badge>
            )}
          </div>

          <iframe
            src={url}
            title="handover"
            className="mt-4 h-[76vh] min-h-[560px] w-full rounded-xl border border-hair bg-white"
          />

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={complete} className="rounded-full">
              I am logged in — carry on
            </Button>
            {watchUrl && (
              <Button asChild variant="link" size="sm">
                <a href={watchUrl} target="_blank" rel="noreferrer">
                  read-only view for everyone else
                </a>
              </Button>
            )}
          </div>
        </>
      )}
    </Shell>
  )
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="dark min-h-dvh bg-ink text-paper">
      <div className={`mx-auto px-6 py-8 ${wide ? 'max-w-[1500px]' : 'max-w-2xl'}`}>
        <div className="mb-8 flex items-center gap-2.5">
          <img src="/brand/mark-light.webp" alt="" className="size-7" />
          <span className="font-semibold tracking-tight">Outwait</span>
        </div>
        {children}
      </div>
    </main>
  )
}
