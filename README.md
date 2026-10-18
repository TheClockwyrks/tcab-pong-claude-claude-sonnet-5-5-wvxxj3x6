# Carom

Carom is a top-down paddle duel for the browser. Two paddles face each other
across a dark field while a ball ricochets between them, off the top and bottom
walls, and off two fixed obstacles in the middle. Score by sending the ball past
your opponent's paddle; first to 11 points with a two-point lead wins.

Its defining mechanic is **spin**: the motion of a paddle at the instant it
strikes the ball curves the ball's flight afterwards, so the obstacles become
bank-shot puzzles. Play **Solo** against the computer or **Versus** with a
friend on the same keyboard. Everything is drawn and synthesized in code; the
game fetches nothing and needs no backend.

It is built on the Simple 2D engine (see `engine/`) with TypeScript and Vite.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

## Production build

```sh
npm run build
```

This type-checks and writes the static site to `dist/`, ready to serve from the
root of any static host. `npm run preview` serves it locally.

## Controls

| Action              | Keys                       |
| ------------------- | -------------------------- |
| Player 1 (left)     | `W` / `S`                  |
| Player 2 (right)    | `ArrowUp` / `ArrowDown`    |
| Confirm             | `Enter` or `Space`         |
| Pause / back        | `Escape`, `P` pauses       |
| Mute                | `M`                        |
| Debug overlay       | `` ` `` (backtick)         |

In Solo, either movement pair drives your paddle. Menus also take a mouse or
touch, and touch devices get on-screen sliders.

## Checks

`npm run typecheck`, `npm run lint`, `npm run format`, and `npm test`.

## Layout

- `src/game.ts` — state types, debug-surface type, and the engine game object
- `src/world.ts` — paddle movement, AI, and ball physics
- `src/update.ts`, `src/menu.ts`, `src/state.ts` — frame update, menus, state builders
- `src/debug.ts` — the debug and automation surface
- `src/render.ts` — drawing
- `showcase/` — store-page description, carousel, and media
