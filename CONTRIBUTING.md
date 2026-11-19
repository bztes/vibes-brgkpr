# Contributing

```sh
pnpm install
pnpm dev
```

Local data is stored in `./data` (see `.env.example`). restic also works locally at `rest:http://localhost:5173/restic/<repo>/`; SSH for Borg is only available in the container.

Before committing: `pnpm lint`, `pnpm check`, `pnpm test`.

- Stack: SvelteKit with remote functions (`src/lib/api/*.remote.ts`), Svelte 5, Tailwind CSS 4, Drizzle with SQLite
- Backends implement `RepoBackend` in `src/lib/server/backends`
- Schema in `src/lib/server/db/schema.ts`; generate migrations with `pnpm db:generate`, they run automatically on startup
