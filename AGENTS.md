# AGENTS.md

Stock-Double Play — real-time stock-trading simulation game (React frontend + NestJS backend + Socket.IO gateway, pnpm monorepo).

## Setup commands

- Install deps: `pnpm install`
- Start dev (frontend): `pnpm dev` (Vite dev server, port 5173)
- Start dev (backend): `cd apps/backend && pnpm start:dev` (NestJS, port 3000 or as configured)
- Build: `pnpm build`
- Test: `pnpm --filter backend test` (no test framework configured yet — add one)

## Project layout

- `src/` — React frontend (Vite, TypeScript strict)
  - `components/` — UI components (panels/, Dashboard/, Header/, etc.)
  - `pages/` — Route pages (Home, Markets, Portfolio, Rankings, Settings, Tools, DealerPanel, RegulatorPanel)
  - `services/` — apiService.ts, wsService.ts
  - `store/` — Zustand game state (gameStore.ts, clock.ts)
  - `types/` — TypeScript types
  - `utils/` — Utilities
- `apps/backend/` — NestJS backend (REST + WebSocket/Socket.IO)
  - `src/auth/` — Authentication
  - `src/common/` — Shared utilities/filters
  - `src/database/` — sql.js in-memory DB layer
  - `src/dealer/` — Dealer (market maker) logic
  - `src/gateway/` — WebSocket/Socket.IO gateway
  - `src/market/` — Market data module
  - `src/match/` — Order matching engine
  - `src/regulator/` — Regulator logic
  - `src/replay/` — Game replay module
  - `src/trading/` — Trading/order management

## Code style

- TypeScript strict mode (`tsconfig.json`: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`)
- Frontend: React 18 + Zustand state, Socket.IO-client for WS, Recharts for charts
- Backend: NestJS 10, class-validator/class-transformer for DTOs, sql.js for persistence
- No ESLint/Prettier config committed yet — run `pnpm build` and typecheck before committing
- Backend entry: `apps/backend/src/main.ts`

## Testing instructions

- No test framework configured yet. Before adding features, establish a test strategy.
- All builds (`pnpm build`) must pass before opening a PR.

## PR & commit conventions

- Branch from `master`; never push to it directly
- Commit message: conventional commits (`feat:` / `fix:` / `docs:` / `refactor:`)
- Open PR via `gh pr create` once CI is green

## Security

- Never commit secrets — `.env` is in `.gitignore`
- Backend CORS and WebSocket origins must be explicitly configured before production deployment
