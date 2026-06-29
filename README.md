# Kutuby ML Intelligence Dashboard

An internal, **read-only** ML observability platform for Kutuby's pronunciation
models (Arabic letters and words). It surfaces outcomes, trends, and per-target
performance over the immutable `child_pronunciation_attempt` production table.

> This handles **children's audio data**. Security, RBAC, and audit logging are
> first-class concerns, not afterthoughts.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v3 +
hand-written shadcn/ui-style primitives · Recharts · @tanstack/react-table ·
@tanstack/react-query · nuqs · Zod · @supabase/supabase-js + @supabase/ssr ·
date-fns · lucide-react · Vitest + Testing Library.

## Getting started

```bash
cp .env.example .env.local   # fill in Supabase URL, keys, allowlist
npm install
npm run dev
```

Open http://localhost:3000.

## Verification gate

Before any change is considered done, all of the following must pass:

```bash
npm run typecheck   # tsc --noEmit (strict, no `any`)
npm run lint        # next lint
npm run test        # vitest run
npm run build       # next build
```

## Outcome taxonomy

- **PASS** = `is_correct === true`
- **FAIL** = `is_correct === false`
- **ERROR** = `is_correct === null` (API/network failure)

"Retry" is **not** an outcome — it is a session-level metric (attempts sharing a
`session_id`).

## More

See [`docs/`](./docs) for architecture and data notes, and
[`supabase/`](./supabase) for the additive, read-only SQL views/RPCs and the
`dashboard_audit_log` table (require human sign-off; not auto-applied).
