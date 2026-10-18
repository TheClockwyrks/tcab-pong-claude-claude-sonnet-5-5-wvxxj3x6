// Carom — one frame of the game: read input, apply it to the screen the frame
// began on, then advance the screen the input left it on.

import type { UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  CUES,
  FIELD_W,
  PADDLE_SPEED,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type {
  BallState,
  CaromState,
  PaddleState,
  PressState,
  Screen,
  Side,
} from "./game";
import { itemAt, menuItems, wrap } from "./menu";
import { returnToTitle, startMatch } from "./state";
import {
  aiVelocity,
  movePaddle,
  parkBall,
  recordTrail,
  serve,
  stepBall,
} from "./world";

type State = DeepReadonly<CaromState>;

/** The input one frame carries, read once. */
interface FrameInput {
  readonly up1: number;
  readonly down1: number;
  readonly up2: number;
  readonly down2: number;
  readonly confirm: boolean;
  readonly back: boolean;
  readonly pause: boolean;
  readonly mute: boolean;
  readonly navUp: boolean;
  readonly navDown: boolean;
}

function readInput(api: UpdateApi): FrameInput {
  const { input } = api;
  const pressed = (name: string): boolean => input.pressed(name);
  const p1Up = pressed("p1-up");
  const p2Up = pressed("p2-up");
  const p1Down = pressed("p1-down");
  const p2Down = pressed("p2-down");
  return {
    up1: input.value("p1-up"),
    down1: input.value("p1-down"),
    up2: input.value("p2-up"),
    down2: input.value("p2-down"),
    confirm: pressed("confirm"),
    back: pressed("back"),
    pause: pressed("pause"),
    mute: pressed("mute"),
    navUp: p1Up || p2Up,
    navDown: p1Down || p2Down,
  };
}

export function updateGame(
  state: State,
  api: UpdateApi,
  dt: number,
): CaromState {
  let s: CaromState = { ...state, simTime: state.simTime + dt } as CaromState;
  const input = readInput(api);

  // The state's `muted` is authoritative: a pose writes it, the bus follows.
  if (api.audio.muted() !== s.muted) api.audio.setMuted(s.muted);
  if (input.mute) {
    s = { ...s, muted: !s.muted };
    api.audio.setMuted(s.muted);
  }

  s = applyMenuInput(s, api, input);
  return advance(s, api, input, dt);
}

// ---- Menus ---------------------------------------------------------------

function applyMenuInput(
  s: CaromState,
  api: UpdateApi,
  input: FrameInput,
): CaromState {
  const screen = s.screen;
  if (screen === "countdown" || screen === "playing") {
    if (!input.pause) return s.presses.length ? { ...s, presses: [] } : s;
    return { ...s, resumeScreen: screen, screen: "paused", menuIndex: 0 };
  }
  if (screen === "paused" && (input.pause || input.back)) {
    return { ...s, screen: s.resumeScreen };
  }

  const count = menuItems(screen).length;
  if (input.navUp || input.navDown) {
    const delta = input.navUp ? -1 : 1;
    if (screen !== "howto") {
      s = { ...s, menuIndex: wrap(s.menuIndex, delta, count) };
    }
  } else if (input.confirm) {
    return activate(s, s.menuIndex);
  } else if (input.back && (screen === "howto" || screen === "matchover")) {
    return returnToTitle(s);
  }
  return applyPointerInput(s, api);
}

function applyPointerInput(s: CaromState, api: UpdateApi): CaromState {
  const screen = s.screen;
  const presses: PressState[] = [...s.presses];
  let menuIndex = s.menuIndex;

  for (const sample of api.input.pointerSamples()) {
    const hit = itemAt(screen, sample.x, sample.y);
    const touch = sample.device === "touch";
    const known = presses.findIndex((p) => p.id === sample.id);
    const primaryButton = touch || sample.button === "primary";

    if (sample.type === "down" && primaryButton) {
      if (known >= 0) presses.splice(known, 1);
      presses.push({ id: sample.id, index: hit });
      if (touch && hit !== null) menuIndex = hit;
    } else if (sample.type === "move") {
      if (hit !== null) menuIndex = hit;
    } else if (sample.type === "up" && primaryButton) {
      const pressed = known >= 0 ? presses[known].index : null;
      if (known >= 0) presses.splice(known, 1);
      if (hit !== null && hit === pressed) {
        return activate({ ...s, menuIndex: hit, presses: [] }, hit);
      }
    }
  }
  return { ...s, menuIndex, presses };
}

/** Confirms item `index` of the menu the current screen shows. */
function activate(s: CaromState, index: number): CaromState {
  const cleared = { ...s, presses: [] };
  switch (s.screen) {
    case "title": {
      const next = { ...cleared, titleIndex: index };
      if (index === 0) return startMatch(next, "solo");
      if (index === 1) return startMatch(next, "versus");
      return { ...next, screen: "howto", menuIndex: 0 };
    }
    case "howto":
      return returnToTitle(cleared);
    case "paused":
      if (index === 0) return { ...cleared, screen: s.resumeScreen };
      if (index === 1) return startMatch(cleared, s.mode);
      return returnToTitle(cleared);
    case "matchover":
      return index === 0 ? startMatch(cleared, s.mode) : returnToTitle(cleared);
    default:
      return s;
  }
}

// ---- The match -----------------------------------------------------------

function advance(
  s: CaromState,
  api: UpdateApi,
  input: FrameInput,
  dt: number,
): CaromState {
  const screen: Screen = s.screen;
  if (screen !== "countdown" && screen !== "playing") return s;

  s = { ...s, paddles: movePaddles(s, input, dt) };
  if (s.ball === null) return s;

  if (screen === "countdown") return advanceCountdown(s, s.ball, dt);
  if (s.ball.held) return withBall(s, recordTrail(s.ball, s.simTime));
  return advancePlay(s, s.ball, api, dt);
}

function withBall(s: CaromState, ball: BallState): CaromState {
  return { ...s, ball };
}

function movePaddles(
  s: CaromState,
  input: FrameInput,
  dt: number,
): CaromState["paddles"] {
  const solo = s.mode === "solo";
  const axis = (up: number, down: number): number => down - up;
  const humanLeft = solo
    ? axis(Math.max(input.up1, input.up2), Math.max(input.down1, input.down2))
    : axis(input.up1, input.down1);

  const drive = (side: Side, paddle: PaddleState): PaddleState => {
    if (paddle.driven) return movePaddle(paddle, paddle.drivenVy, dt);
    if (side === "left")
      return movePaddle(paddle, humanLeft * PADDLE_SPEED, dt);
    if (!solo)
      return movePaddle(
        paddle,
        axis(input.up2, input.down2) * PADDLE_SPEED,
        dt,
      );
    const vy = s.ai.movement
      ? aiVelocity(paddle.cy, s.ball, s.screen === "playing", s.ai.tracking, dt)
      : 0;
    return movePaddle(paddle, vy, dt);
  };
  return {
    left: drive("left", s.paddles.left),
    right: drive("right", s.paddles.right),
  };
}

function advanceCountdown(
  s: CaromState,
  ball: BallState,
  dt: number,
): CaromState {
  if (!ball.held) return withBall(s, recordTrail(ball, s.simTime));
  const holdTimer = ball.holdTimer - dt;
  if (holdTimer <= 0) {
    return { ...s, screen: "playing", ball: serve(ball, s.receiver) };
  }
  return withBall(s, recordTrail({ ...ball, holdTimer }, s.simTime));
}

function advancePlay(
  s: CaromState,
  ball: BallState,
  api: UpdateApi,
  dt: number,
): CaromState {
  const step = stepBall(ball, s.paddles, s.obstacles, dt);
  if (step.events.paddleHit) api.audio.play(CUES.paddleHit);
  if (step.events.wallBounce) api.audio.play(CUES.wallBounce);
  if (step.events.obstacleBounce) api.audio.play(CUES.obstacleBounce);

  const moved = recordTrail(step.ball, s.simTime);
  const scorer: Side | null =
    moved.x - BALL_R > FIELD_W ? "left" : moved.x + BALL_R < 0 ? "right" : null;
  if (scorer === null) return withBall(s, moved);

  api.audio.play(CUES.score);
  return scorePoint(s, moved, scorer);
}

/** Whether a score line ends the match, and for whom. */
export function matchWinner(p1: number, p2: number): Side | null {
  if (p1 >= WIN_SCORE && p1 - p2 >= WIN_LEAD) return "left";
  if (p2 >= WIN_SCORE && p2 - p1 >= WIN_LEAD) return "right";
  return null;
}

/** `scorer` is the side whose player just scored. */
function scorePoint(s: CaromState, ball: BallState, scorer: Side): CaromState {
  const score =
    scorer === "left"
      ? { p1: s.score.p1 + 1, p2: s.score.p2 }
      : { p1: s.score.p1, p2: s.score.p2 + 1 };
  const winner = matchWinner(score.p1, score.p2);
  if (winner !== null) {
    return { ...s, score, winner, screen: "matchover", menuIndex: 0, ball };
  }
  return {
    ...s,
    score,
    screen: "countdown",
    receiver: scorer === "left" ? "right" : "left",
    ball: parkBall(),
  };
}
