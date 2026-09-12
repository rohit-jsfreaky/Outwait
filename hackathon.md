# Hackathon log

> This is the file the judges read. The Convex hackathon skill maintains it — run `/hackathon`
> after every working session. It reads the repo and fills in the components, Convex features and
> models it actually finds in the code, so this file stays honest by construction.
>
> Everything below is a placeholder until Phase 0 fills it in. **Do not invent entries.**

- **Project:** Outwait
- **What it does:** Works a stuck admin case for weeks — fills the web forms itself, chases by
  email, and asks a human only for the ten seconds only a human can do.
- **Live app:** _(convex.site URL — set in Phase 0)_
- **Repo:** _(set in Phase 0)_
- **Frontend:** Convex static hosting
- **Convex deployment:** _(set in Phase 0)_
- **Components:** _(filled from convex/convex.config.ts)_
- **Convex features:** _(filled from the code)_
- **Auth:** Convex Auth
- **AI models:** OpenAI GPT-5.6 Luna (via OpenRouter)
- **Started:** _(set on first run)_
- **Last updated:** _(set on every run)_

## Log

_(The skill appends dated entries backed by commits or file evidence. Do not hand-write these.)_

---

## Notes for whoever writes the final version

Three things the judges should be able to see from this file alone:

1. **Convex is the backend**, not a database behind a server — queries, mutations, actions, http
   actions, scheduled functions, Workflow, Presence, Auth.
2. **The three sponsors do real work**, and where: Firecrawl operates the web through `/interact`,
   AgentMail holds the case as a thread and is also how the agent talks to the user, OpenAI reads
   and decides in one file.
3. **The honest limits** from `DESIGN.md` §12. A judge will find them anyway; better that they read
   them here first.
