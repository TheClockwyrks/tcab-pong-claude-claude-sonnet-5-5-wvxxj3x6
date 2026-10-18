// Carom — the debug and automation surface (`specs/instrumentation.md`). Every
// operation takes the current state first; a pose returns the next state and a
// reading returns what it read.

import type { DeepReadonly } from "ts-essentials";
import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
  Screen,
  Side,
} from "./game";
import { itemRect } from "./menu";
import { titleState } from "./state";
import { drawServeSign, obstacleAt, parkBall } from "./world";

type State = DeepReadonly<CaromState>;

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

function fail(message: string): never {
  throw new Error(`Carom debug: ${message}`);
}

function requireBall(state: State): DeepReadonly<BallState> {
  return state.ball ?? fail("the field carries no ball");
}

function withBall(state: State, change: Partial<BallState>): CaromState {
  return { ...state, ball: { ...requireBall(state), ...change } } as CaromState;
}

function withPaddle(
  state: State,
  side: Side,
  change: Partial<PaddleState>,
): CaromState {
  return {
    ...state,
    paddles: {
      ...state.paddles,
      [side]: { ...state.paddles[side], ...change },
    },
  } as CaromState;
}

function checkIndex(index: number): 0 | 1 {
  if (index !== 0 && index !== 1) fail(`no obstacle with index ${index}`);
  return index;
}

function snapshot(state: State): CaromSnapshot {
  const { left, right } = state.paddles;
  const paddle = (p: DeepReadonly<PaddleState>) => ({
    cy: p.cy,
    vy: p.vy,
    drivenVy: p.drivenVy,
    driven: p.driven,
  });
  const b = state.ball;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: { left: paddle(left), right: paddle(right) },
    ai: { tracking: state.ai.tracking, movement: state.ai.movement },
    receiver: state.receiver,
    ball: b && {
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      speed: Math.hypot(b.vx, b.vy),
      spin: b.spin,
      held: b.held,
      holdTimer: b.holdTimer,
      serveSign: b.serveSign,
      trail: b.trail.map((t) => ({ x: t.x, y: t.y, t: t.t })),
    },
    obstacles: state.obstacles.map((o) => ({
      index: o.index,
      cx: o.cx,
      cy: o.cy,
    })),
    simTime: state.simTime,
  };
}

export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }) as CaromState,
    spawnBall: (s) => ({ ...s, ball: parkBall() }) as CaromState,
    spawnObstacle: (s, index) => {
      const placed: ObstacleState = obstacleAt(checkIndex(index));
      const others = s.obstacles.filter((o) => o.index !== placed.index);
      const obstacles = [...others, placed].sort((a, b) => a.index - b.index);
      return { ...s, obstacles } as CaromState;
    },
    reset: (s) => titleState(0, 0, s.muted),
    reconcile: (s) => ({ ...s }) as CaromState,

    setScreen: (s, screen) => {
      if (!SCREENS.includes(screen)) fail(`unknown screen ${String(screen)}`);
      return { ...s, screen } as CaromState;
    },
    setMode: (s, mode: Mode) => {
      if (mode !== "solo" && mode !== "versus") fail(`unknown mode ${mode}`);
      return { ...s, mode } as CaromState;
    },
    setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }) as CaromState,
    setTitleIndex: (s, titleIndex) => ({ ...s, titleIndex }) as CaromState,
    setResumeScreen: (s, resumeScreen) => {
      if (resumeScreen !== "countdown" && resumeScreen !== "playing") {
        fail(`cannot resume to ${String(resumeScreen)}`);
      }
      return { ...s, resumeScreen } as CaromState;
    },

    setScore: (s, p1, p2) => ({ ...s, score: { p1, p2 } }) as CaromState,
    setWinner: (s, winner) => ({ ...s, winner }) as CaromState,
    setReceiver: (s, receiver) => ({ ...s, receiver }) as CaromState,

    setPaddleCy: (s, side, cy) => withPaddle(s, side, { cy }),
    setPaddleVy: (s, side, drivenVy) => withPaddle(s, side, { drivenVy }),
    setPaddleDriven: (s, side, driven) => withPaddle(s, side, { driven }),

    setBallPosition: (s, x, y) => withBall(s, { x, y }),
    setBallVelocity: (s, vx, vy) => withBall(s, { vx, vy }),
    setBallSpin: (s, spin) => withBall(s, { spin }),
    setBallHeld: (s, held) => withBall(s, { held }),
    setBallHoldTimer: (s, holdTimer) => withBall(s, { holdTimer }),
    setBallServeSign: (s, serveSign) => {
      if (serveSign !== 1 && serveSign !== -1) fail("serve sign is 1 or -1");
      return withBall(s, { serveSign });
    },
    drawBallServeSign: (s) => withBall(s, { serveSign: drawServeSign() }),

    setAiTracking: (s, tracking) =>
      ({ ...s, ai: { ...s.ai, tracking } }) as CaromState,
    setAiMovement: (s, movement) =>
      ({ ...s, ai: { ...s.ai, movement } }) as CaromState,

    setMuted: (s, muted) => ({ ...s, muted }) as CaromState,

    snapshot,
    menuItemRect: (s, index) => {
      const r = itemRect(s.screen, index);
      return r && { x: r.x, y: r.y, w: r.w, h: r.h };
    },
  };
}
