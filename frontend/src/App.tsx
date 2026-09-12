import { useQuery } from 'convex/react'
import { api } from '@backend/_generated/api'

function App() {
  const status = useQuery(api.status.get)

  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900 flex items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <h1 className="text-5xl font-semibold tracking-tight">Outwait</h1>

        <p className="mt-4 text-xl text-stone-600">
          They wait you out. Outwait waits longer.
        </p>

        <p className="mt-8 text-stone-600 leading-relaxed">
          Companies do not say no. They just make it take longer than you are
          willing to spend. A form, then an email, then two weeks of silence.
          This works the case for weeks and only taps you for the ten seconds
          that actually need a person.
        </p>

        <div className="mt-10 rounded-lg border border-stone-200 bg-white p-4 text-sm">
          {status === undefined ? (
            <span className="text-stone-400">Connecting to Convex…</span>
          ) : (
            <span className="text-stone-600">
              <span className="inline-block size-2 rounded-full bg-emerald-500 mr-2 align-middle" />
              Live from Convex — phase {status.phase}, server time{' '}
              {new Date(status.serverTime).toISOString()}
            </span>
          )}
        </div>

        <p className="mt-6 text-sm text-stone-400">
          Built for the Convex All Gas Hackathon. Still being built.
        </p>
      </div>
    </main>
  )
}

export default App
