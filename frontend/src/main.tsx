import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import './index.css'
import App from './App.tsx'
import Handover from './Handover.tsx'
import Landing from './Landing.tsx'

// VITE_CONVEX_URL is set by the static-hosting CLI at deploy time, and by
// `npx convex dev` into ../backend/.env.local during development.
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

// Three screens, no router dependency. SPA fallback serves index.html for any
// path, so reading the path here is enough.
function Root() {
  const path = window.location.pathname

  // A first-paint guess only, so the scrollbar is not the wrong colour for a
  // frame. Each screen then declares its own surface via useSurface().
  document.documentElement.dataset.surface =
    path === '/' ? 'dark' : 'light'

  // The handover page is deliberately NOT behind auth. Somebody tapped a
  // one-tap link from an email on their phone; the token in the URL is the
  // credential. Making them sign in first would break the one thing the
  // product promises — that it costs you ten seconds.
  const match = /^\/handover\/([A-Za-z0-9]+)\/?$/.exec(path)
  if (match) return <Handover token={match[1]} />

  // The landing page is the front door; the board lives at /board. Someone who
  // arrives from the video or a link should read the argument first.
  if (path === '/board' || path.startsWith('/board/')) return <App />
  return (
    <Landing
      onOpen={() => {
        window.history.pushState({}, '', '/board')
        window.location.reload()
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <Root />
    </ConvexAuthProvider>
  </StrictMode>,
)
