# @spiritual/tracking-core

Shared Drizzle schema + typed query helpers for the `spiritual-*` marketing tracking system (visitors, sessions, events, leads). The single source of truth for these tables' shape — consumed by `spiritual-marketing-site` (ingest) and `spiritual-business-dashboard` (reporting) as a git-tag-pinned dependency, not duplicated in either app.

## Why this exists

`spiritual-marketing-site` and `spiritual-business-dashboard` are two independent repos/Vercel projects sharing one Postgres database. Rather than either (a) merging them into a monorepo, or (b) letting the ingest app write raw hand-written SQL against tables it doesn't own, this package is the typed, versioned contract between them. See `docs/superpowers/specs/2026-08-08-marketing-tracking-architecture-design.md` in `spiritual-business-dashboard` for the full design rationale.

## Usage

```json
{
  "dependencies": {
    "@spiritual/tracking-core": "github:oreliayevfit-wq/spiritual-tracking-core#v0.1.0"
  }
}
```

```ts
import { createTrackingDb, upsertVisitor, upsertSession, insertEvent, createLeadTransactional } from "@spiritual/tracking-core";
```

## Upgrading

Bump the `#vX.Y.Z` tag in both consuming apps' `package.json` together. Never point at a branch — this repo's whole purpose is a stable, versioned contract, not a live shared import.

## Development

```
npm install
npm test        # vitest, pglite-backed
npm run typecheck
npm run build    # emits dist/ (also runs automatically via "prepare" when installed as a dependency)
npm run db:generate   # regenerate drizzle/ migration after a schema.ts change (needs DATABASE_URL)
```

Migrations in `drizzle/` are applied manually against the shared Postgres instance (`npx drizzle-kit migrate`, with `DATABASE_URL` pointed at it) — there's no CI/automation for this yet at the current scale.
