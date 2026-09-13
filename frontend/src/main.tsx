import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import './index.css'
import App from './App.tsx'
import Handover from './Handover.tsx'

// VITE_CONVEX_URL is set by the static-hosting CLI at deploy time, and by
// `npx convex dev` into ../backend/.env.local during development.
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

// Two screens, no router dependency. SPA fallback serves index.html for any
// path, so reading the path here is enough.
function Root() {
  const match = /^\/handover\/([A-Za-z0-9]+)\/?$/.exec(window.location.pathname)
  if (match) return <Handover token={match[1]} />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <Root />
    </ConvexProvider>
  </StrictMode>,
)
