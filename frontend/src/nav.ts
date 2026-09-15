import { useCallback, useEffect, useState } from 'react'

/**
 * Where you are inside the board.
 *
 * Real URLs, because a case is a thing you send someone a link to. Done with
 * history.pushState rather than a router dependency — there are three views and
 * one of them takes an id, which is not worth a routing library.
 */
export type View =
  | { name: 'cases' }
  | { name: 'waiting' }
  | { name: 'case'; id: string }

export function parse(path: string): View {
  const m = /^\/board\/case\/([A-Za-z0-9_-]+)\/?$/.exec(path)
  if (m) return { name: 'case', id: m[1] }
  if (/^\/board\/waiting\/?$/.test(path)) return { name: 'waiting' }
  return { name: 'cases' }
}

export function href(v: View): string {
  if (v.name === 'case') return `/board/case/${v.id}`
  if (v.name === 'waiting') return '/board/waiting'
  return '/board'
}

export function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => parse(window.location.pathname))

  // The back button has to work. Anything else feels broken.
  useEffect(() => {
    const onPop = () => setView(parse(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback((v: View) => {
    window.history.pushState({}, '', href(v))
    setView(v)
    // A new screen starts at the top, the way a page load would.
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [])

  return [view, go]
}
