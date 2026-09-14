# SOUL

A Vampire-Survivors-like set in Floriano, Piauí, after the aliens land. O Indígena walks east with a revolver to get Soul back.

## Stack

- Frontend: React 18 + TypeScript + Vite
- Rendering: Canvas 2D without a game engine
- Backend: Phoenix/Elixir app under `backend/soul_game`
- Database: PostgreSQL
- Local orchestration: Docker Compose

## Prerequisites

For the frontend:

- Node.js 18+ or 20 LTS
- npm

For the backend or the full local stack:

- Docker + Docker Compose
- Elixir + Erlang/OTP if you want to run the Phoenix app directly instead of using Docker

## Install dependencies

Frontend dependencies are managed in the root project:

```bash
npm install
```

The current frontend dependencies are:

- `react` and `react-dom`
- `@types/react` and `@types/react-dom`
- `vite`
- `@vitejs/plugin-react`
- `typescript`

If you want to run the backend directly instead of through Docker, install its dependencies in the Elixir app:

```bash
cd backend/soul_game
mix deps.get
```

## Run the project

### Frontend only

```bash
npm run dev
```

This starts the Vite dev server. The app is usually available at:

- http://localhost:5173

### Full stack with Docker

This project includes a Docker Compose setup for frontend, backend, and PostgreSQL:

```bash
docker compose up --build
```

The services exposed by the compose file are:

- Frontend: http://localhost:8080
- Backend API: http://localhost:4000
- PostgreSQL: localhost:5432

### Backend only (local Elixir run)

```bash
cd backend/soul_game
mix deps.get
mix phx.server
```

## Useful scripts

From the project root:

```bash
npm run dev
npm run build
npm run preview
npm run typecheck
```

`npm run build` runs TypeScript and Vite build, and `npm run typecheck` performs a no-emit type check.

## Project layout

```text
.
├── backend/
│   └── soul_game/      # Phoenix / Elixir backend
├── public/             # static assets, sprites, maps, ui
├── src/                # frontend game code and UI
├── docker-compose.yml  # local stack for frontend + backend + db
├── package.json        # frontend dependencies and scripts
├── tsconfig.json       # TypeScript config
├── vite.config.ts      # Vite config
├── index.html
├── README.md
├── SCOPE.md
└── CLAUDE.md
```

## Controls

- WASD / arrow keys to move
- Revolver aims and fires automatically
- ESC pauses the game
- On mobile, drag anywhere to play

## Art and content workflow

To add a sprite:

1. Drop the PNG into `public/sprites/`
2. Add the asset entry in `src/game/data/sprites.ts`
3. Reference it from the relevant enemy or stage data file

Frames do not need to be on a grid; the loader calculates their bounds automatically.

See [SCOPE.md](SCOPE.md) for the game design, acts, art notes, and roadmap.
