import { useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { ArrowLeft, ArrowRight, Mail, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import DotGrid from '@/components/DotGrid'
import { useSurface } from './surface'

/**
 * Signing in.
 *
 * No password, because there is no password anywhere in this product. You give
 * an address, a six-digit code arrives from the agent's own inbox, you type it
 * back. The address you sign in with is then, by definition, an address that
 * works — which is the only thing the agent ever actually needs from you.
 */
export default function SignIn() {
  useSurface('dark')
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<'email' | { email: string }>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>, next: 'code' | 'done') {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await signIn('agentmail-otp', form)
      if (next === 'code') setStep({ email: String(form.get('email') ?? '') })
    } catch {
      // The library does not say which code was wrong, on purpose. Saying
      // "that code is not right" is all a person can act on anyway.
      setError(
        next === 'code'
          ? 'Could not send the code. Check the address and try again.'
          : 'That code is not right, or it has expired. Ask for a new one.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink px-6 text-paper">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-80">
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

      <div className="relative w-full max-w-[380px]">
        <a href="/" className="mb-10 flex items-center justify-center gap-2.5">
          <img src="/brand/mark-light.webp" alt="" className="size-7" />
          <span className="text-[17px] font-semibold tracking-tight">Outwait</span>
        </a>

        {step === 'email' ? (
          <form onSubmit={(e) => submit(e, 'code')}>
            <h1 className="font-display text-[32px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Sign in to your board.
            </h1>
            <p className="mt-3 text-[15px] leading-[1.55] text-white/55">
              There is no password. We will email you a six-digit code, the same
              way the agent reaches you about everything else.
            </p>

            <div className="mt-8 space-y-2">
              <Label htmlFor="email" className="text-white/60">
                Your email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@example.com"
                className="h-11 rounded-full border-white/15 bg-white/5 px-5 text-[15px] text-white placeholder:text-white/30"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="mt-4 border-white/15 text-white/80">
                <TriangleAlert />
                <AlertDescription className="text-white/70">{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={busy}
              className="mt-6 h-11 w-full rounded-full bg-paper text-[15px] font-medium text-ink hover:bg-paper/85"
            >
              {busy ? <Spinner /> : <Mail />}
              {busy ? 'Sending the code…' : 'Email me a code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={(e) => submit(e, 'done')}>
            <h1 className="font-display text-[32px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Check your email.
            </h1>
            <p className="mt-3 text-[15px] leading-[1.55] text-white/55">
              A six-digit code is on its way to{' '}
              <span className="text-white/85">{step.email}</span>. It works once and
              expires in fifteen minutes.
            </p>

            <input type="hidden" name="email" value={step.email} />

            <div className="mt-8 space-y-2">
              <Label htmlFor="code" className="text-white/60">
                The code
              </Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={6}
                placeholder="000000"
                className="h-11 rounded-full border-white/15 bg-white/5 px-5 text-center font-mono text-[18px] tracking-[0.4em] text-white placeholder:text-white/25"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="mt-4 border-white/15 text-white/80">
                <TriangleAlert />
                <AlertDescription className="text-white/70">{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={busy}
              className="mt-6 h-11 w-full rounded-full bg-paper text-[15px] font-medium text-ink hover:bg-paper/85"
            >
              {busy ? <Spinner /> : null}
              {busy ? 'Checking…' : 'Open the board'}
              {!busy && <ArrowRight />}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep('email')
                setError(null)
              }}
              className="mt-2 h-10 w-full rounded-full text-[14px] text-white/50 hover:bg-white/8 hover:text-white"
            >
              <ArrowLeft />
              Use a different address
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
