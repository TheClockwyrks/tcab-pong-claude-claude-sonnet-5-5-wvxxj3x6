// Carom — the game. The state it holds, the debug surface that poses and reads
// that state, and the three functions the engine drives. The simulation lives in
// `world.ts`, the menus in `menu.ts` and `update.ts`, the debug surface in
// `debug.ts`, and the drawing in `render.ts`.

import type { Game, InitApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES } from "./constants";
import { createDebugApi } from "./debug";
import { drawGame } from "./render";
import { titleState } from "./state";
import { updateGame } from "./update";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/** A pointer press waiting for its release: the menu item it landed on. */
export interface PressState {
  readonly id: number;
  readonly index: number | null;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /**
   * Derived bookkeeping, not part of the declared contract: the menu item each
   * pointer in contact landed on, so its release can be matched to the press.
   * A reset empties it.
   */
  readonly presses: readonly PressState[];
}

/** What `CaromDebugApi.snapshot` reports. */
export interface CaromSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: {
    left: { cy: number; vy: number; drivenVy: number; driven: boolean };
    right: { cy: number; vy: number; drivenVy: number; driven: boolean };
  };
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    spin: number;
    held: boolean;
    holdTimer: number;
    serveSign: 1 | -1;
    trail: { x: number; y: number; t: number }[];
  } | null;
  obstacles: { index: number; cx: number; cy: number }[];
  simTime: number;
}

export interface MenuItemRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type State = DeepReadonly<CaromState>;

/** The debug and automation surface `specs/instrumentation.md` fixes. */
export interface CaromDebugApi {
  readonly version: number;

  clearWorld(state: State): CaromState;
  spawnBall(state: State): CaromState;
  spawnObstacle(state: State, index: number): CaromState;
  reset(state: State): CaromState;
  reconcile(state: State): CaromState;

  setScreen(state: State, screen: Screen): CaromState;
  setMode(state: State, mode: Mode): CaromState;
  setMenuIndex(state: State, index: number): CaromState;
  setTitleIndex(state: State, index: number): CaromState;
  setResumeScreen(state: State, screen: "countdown" | "playing"): CaromState;

  setScore(state: State, p1: number, p2: number): CaromState;
  setWinner(state: State, side: Side | null): CaromState;
  setReceiver(state: State, side: Side): CaromState;

  setPaddleCy(state: State, side: Side, cy: number): CaromState;
  setPaddleVy(state: State, side: Side, vy: number): CaromState;
  setPaddleDriven(state: State, side: Side, driven: boolean): CaromState;

  setBallPosition(state: State, x: number, y: number): CaromState;
  setBallVelocity(state: State, vx: number, vy: number): CaromState;
  setBallSpin(state: State, spin: number): CaromState;
  setBallHeld(state: State, held: boolean): CaromState;
  setBallHoldTimer(state: State, seconds: number): CaromState;
  setBallServeSign(state: State, sign: 1 | -1): CaromState;
  drawBallServeSign(state: State): CaromState;

  setAiTracking(state: State, enabled: boolean): CaromState;
  setAiMovement(state: State, enabled: boolean): CaromState;

  setMuted(state: State, muted: boolean): CaromState;

  snapshot(state: State): CaromSnapshot;
  menuItemRect(state: State, index: number): MenuItemRect | null;
}

/** The field background, which the engine clears the canvas to each frame. */
export const BACKGROUND = "#080b16";

function registerDiagnostics(api: InitApi<CaromState>): void {
  const fixed = (n: number): string => n.toFixed(1);
  const d = api.diagnostics;
  d.register("screen", (s) => s.screen);
  d.register("mode", (s) => s.mode);
  d.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  d.register("ball pos", (s) =>
    s.ball ? `${fixed(s.ball.x)}, ${fixed(s.ball.y)}` : "-",
  );
  d.register("ball vel", (s) =>
    s.ball ? `${fixed(s.ball.vx)}, ${fixed(s.ball.vy)}` : "-",
  );
  d.register("ball speed", (s) =>
    s.ball ? fixed(Math.hypot(s.ball.vx, s.ball.vy)) : "-",
  );
  d.register("ball spin", (s) => (s.ball ? fixed(s.ball.spin) : "-"));
  d.register(
    "left paddle",
    (s) => `${fixed(s.paddles.left.cy)} v${fixed(s.paddles.left.vy)}`,
  );
  d.register(
    "right paddle",
    (s) => `${fixed(s.paddles.right.cy)} v${fixed(s.paddles.right.vy)}`,
  );
}

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api) {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    api.audio.define(CUES.paddleHit, {
      wave: "square",
      freq: 520,
      freqTo: 440,
      durationMs: 70,
      gain: 0.12,
    });
    api.audio.define(CUES.wallBounce, {
      wave: "triangle",
      freq: 300,
      freqTo: 240,
      durationMs: 60,
      gain: 0.2,
    });
    api.audio.define(CUES.obstacleBounce, {
      wave: "sawtooth",
      freq: 190,
      freqTo: 130,
      durationMs: 90,
      gain: 0.1,
    });
    api.audio.define(CUES.score, {
      wave: "sine",
      freq: 440,
      freqTo: 880,
      durationMs: 260,
      gain: 0.22,
    });
    registerDiagnostics(api);
    return [titleState(0, 0, false), createDebugApi()];
  },

  update: updateGame,

  render: drawGame,
};
