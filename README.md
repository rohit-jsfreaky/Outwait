# Outwait

**They wait you out. Outwait waits longer.**

You are owed money. A deposit, a refund, a delayed-flight payout, a wrongly charged bill. The
company never says no. They just make it slow — a form, then an email, then "please call us", then
two weeks of silence, then a reply asking for something you have to go and find.

Every one of those switches is a place where a normal person quits. Not because it is hard, because
it is long.

A machine does not get bored. That is the whole product, and it is where the name comes from: you
do not outsmart them, you outwait them.

Built for the [Convex All Gas Hackathon](https://vibeapps.dev/tag/allgashackathon).

**Live app:** https://frugal-gopher-151.convex.site
**Build log:** [hackathon.md](./hackathon.md)

> **Status: early.** Phase 0 of 9 is done — the app is deployed and talking to Convex, and that is
> all it does so far. Everything below describes what is being built, not what already works. The
> build log has the honest, dated version.

## The rule the product is built on

The person who abandons a deposit claim will never open a website again. But they will reply to an
email from their phone in twenty seconds.

**So the agent never asks you to come back to the app. It emails you.** A case starts by forwarding
an email, not by filling a form — one forward gives the agent the company's real reply-to address,
the reference number, the names, the dates and the whole history, for zero effort.

The app is where you go to look. Email is how the app comes to you.

## Three boundaries

The product is really about one question: where does the human stand when the agent does the work?

1. **The agent acts as itself.** When a step needs an account that is not yours — a complaints
   portal, an ombudsman, a claims registry — it registers itself with its own email address and
   reads its own verification code out of its own inbox. You are never involved.
2. **The agent asks before it commits.** Anything binding — a formal complaint, accepting an offer,
   anything naming a number — is held as a draft until a person approves it. Nothing binding is
   ever sent on a model's own judgement.
3. **The agent hands over the wheel.** When a step needs an account that *is* yours, it does not ask
   for your password. It sends a one-tap link, and the live browser opens on your phone for the ten
   seconds only you can do. Then it carries on.

## A case is many tracks, not one line

One track gets blocked waiting on a human. The others keep moving. While blocked, the agent fills in
the whole form so the person's part is only the password, and it looks for a route around the block
entirely — email first, its own account second, and asking you only last.

## Stack

| | |
|---|---|
| **Convex** | the backend — database, queries, mutations, actions, HTTP actions, scheduling, workflows, presence, auth, and the static hosting that serves this app |
| **Firecrawl** | reads the web, and operates it — `/interact` drives a real browser and hands it to a human for logins |
| **AgentMail** | the agent's own inbox and identity, threads as case files, drafts as the approval gate, and the inbound webhook that makes the board move live |
| **OpenAI** | reads a forwarded letter, classifies replies, decides the next action, drafts the emails |

## Layout

Three separate npm projects in one repo. No workspaces — each folder installs on its own.

```
backend/      the Convex app. This is the backend.
frontend/     Vite + React. Builds to frontend/dist, which backend/ uploads to convex.site.
component/    a publishable Convex component for Firecrawl /interact. Built last.
```

## Running it

```bash
# backend
cd backend
npm install
cp .env.example .env.local     # then fill it in
npx convex dev

# frontend, in a second terminal
cd frontend
npm install
npm run dev
```

Deploy the whole thing — backend and static site together — from `backend/`:

```bash
npm run deploy
```

## Honest limits

- It works best where companies have bad self-service. Amazon already works; this is not for Amazon.
- A saved login persists only as long as the site itself allows. A bank may be minutes. A small
  portal may be months.
- The browser runs from a datacenter IP, so sites with aggressive bot detection will challenge it.
  Sites with bad self-service tend to have weak detection, and those are the sites this is for.
- It cannot make a phone call. When a company demands one, it escalates in writing instead. That is
  usually better, but it is a workaround, not a solution.
- **This is not legal advice and it never claims to be.** The claim is only that it chases, and that
  it does not get bored.
