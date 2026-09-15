import { useEffect } from 'react'

/**
 * Tell the browser whether the screen currently on show is dark or light.
 *
 * This exists for one reason: the scrollbar gutter is painted by the browser
 * from `color-scheme`, not from our theme tokens. A near-black page under a
 * light color-scheme gets a white scrollbar track down the side of it.
 *
 * It cannot be decided from the URL, because /board is dark while it is asking
 * you to sign in and light once you are. So each screen declares what it is.
 */
export function useSurface(kind: 'dark' | 'light') {
  useEffect(() => {
    document.documentElement.dataset.surface = kind
  }, [kind])
}
