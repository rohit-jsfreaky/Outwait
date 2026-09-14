import usePresence from '@convex-dev/presence/react'
import { api } from '@backend/_generated/api'

/**
 * Who else is looking at this right now.
 *
 * On a shared deposit — three flatmates, one claim — the useful thing is not
 * a pretty avatar stack. It is knowing that someone else is already on it, so
 * you do not go and do the same job twice.
 */
export function WhoElse({ roomId, me }: { roomId: string; me: string }) {
  const state = usePresence(api.presence, roomId, me)
  if (!state) return null

  const online = state.filter((p) => p.online)
  const others = online.filter((p) => p.userId !== me)

  if (others.length === 0) {
    return <span className="text-xs text-stone-400">Only you are looking at this.</span>
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs text-emerald-800">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {others.length === 1
        ? `${short(others[0].userId)} is looking at this too`
        : `${others.length} others are looking at this`}
    </span>
  )
}

/**
 * During a handover this is the important one: everyone can see who is holding
 * the wheel, so nobody types over anybody.
 */
export function WhoIsDriving({ roomId, me }: { roomId: string; me: string }) {
  const state = usePresence(api.presence, roomId, me)
  if (!state) return null

  const online = state.filter((p) => p.online)
  const driver = online.find((p) => p.userId === me)
  const watchers = online.filter((p) => p.userId !== me)

  return (
    <div className="text-sm">
      <p className="text-stone-700">
        {driver ? 'You are driving.' : 'Someone else is driving.'}{' '}
        {watchers.length > 0 && (
          <span className="text-stone-500">
            {watchers.length === 1
              ? `${short(watchers[0].userId)} is watching, read-only.`
              : `${watchers.length} others are watching, read-only.`}
          </span>
        )}
      </p>
    </div>
  )
}

function short(id: string) {
  const at = id.indexOf('@')
  return at > 0 ? id.slice(0, at) : id
}
