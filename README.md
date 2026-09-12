# SOUL

A Vampire-Survivors-like set in Floriano, Piauí, after the aliens land.
O Indígena walks east with a revolver to get Soul back.

React + TypeScript + Canvas 2D. No game engine. Static build, deploys to Vercel.

```bash
npm install
```

```bash
npm run dev
```

**[SCOPE.md](SCOPE.md)** — what is built, how the three acts work, how to add
your art, what the art still needs, and what comes next.

## Controls

WASD / arrows to walk. The revolver aims and fires on its own. ESC pauses.
On a phone, drag anywhere.

## Layout

```
public/sprites/   your character and enemy art
public/map_bg/    ground and road tiles
public/ui/        Kenney Pixel UI pack (CC0)
src/game/data/    sprites, enemies, weapons, stages — the files you edit
src/game/         engine: loop, world generation, systems
src/ui/           HUD and menus
```

To put a new sprite in the game: drop the PNG in `public/sprites/`, add a line
to `src/game/data/sprites.ts`, reference it from `src/game/data/enemies.ts`.
Frames do not need to be on a grid — the loader works them out. See
[SCOPE.md](SCOPE.md) §4.
