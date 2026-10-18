// Carom — the render-free simulation: parking, paddle movement, the AI, and the
// ball's physics. Everything here is a pure function over plain values.

import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  HOLD_TIME,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLE_CENTERS,
  OBSTACLE_HH,
  OBSTACLE_HW,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TRAIL_TIME,
  type Rect,
} from "./constants";
import type {
  BallState,
  ObstacleState,
  PaddleState,
  Side,
  TrailSample,
} from "./game";

export interface BallEvents {
  readonly paddleHit: boolean;
  readonly wallBounce: boolean;
  readonly obstacleBounce: boolean;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Draws a serve sign, `1` and `-1` each equally likely. */
export const drawServeSign = (): 1 | -1 => (Math.random() < 0.5 ? -1 : 1);

/** A ball at its home point, waiting to be served. */
export function parkBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

export function centeredPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

export function obstacleAt(index: 0 | 1): ObstacleState {
  const { x, y } = OBSTACLE_CENTERS[index];
  return { index, cx: x, cy: y };
}

/** Sets a paddle's velocity, then integrates and clamps it. */
export function movePaddle(
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState {
  const next = clamp(paddle.cy + vy * dt, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actual =
    next !== paddle.cy + vy * dt && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actual };
}

/** The velocity the AI wants for a paddle at `cy`, given the ball it can see. */
export function aiVelocity(
  cy: number,
  ball: BallState | null,
  playing: boolean,
  tracking: boolean,
  dt: number,
): number {
  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (tracking && playing && ball !== null && ball.vx > 0) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }
  const diff = target - cy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}

/** Serves a held ball whose hold has run out. */
export function serve(ball: BallState, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    holdTimer: 0,
    held: false,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

/** Appends the ball's position as a trail sample and drops the stale ones. */
export function recordTrail(ball: BallState, simTime: number): BallState {
  const kept: TrailSample[] = ball.trail.filter(
    (s) => simTime - s.t <= TRAIL_TIME,
  );
  kept.push({ x: ball.x, y: ball.y, t: simTime });
  return { ...ball, trail: kept };
}

interface Mutable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

type Face = "left" | "right" | "top" | "bottom";

/** Whether a ball overlaps `rect`, and which face it struck if so. */
function struckFace(b: Mutable, rect: Rect): Face | null {
  const inside =
    b.x > rect.x0 - BALL_R &&
    b.x < rect.x1 + BALL_R &&
    b.y > rect.y0 - BALL_R &&
    b.y < rect.y1 + BALL_R;
  if (!inside) return null;
  const depths: [Face, number][] = [
    ["left", b.x - (rect.x0 - BALL_R)],
    ["right", rect.x1 + BALL_R - b.x],
    ["top", b.y - (rect.y0 - BALL_R)],
    ["bottom", rect.y1 + BALL_R - b.y],
  ];
  let best = depths[0];
  for (const d of depths) if (d[1] < best[1]) best = d;
  return best[0];
}

/** Places the ball off the struck face and reverses the velocity into it. */
function resolveFace(b: Mutable, rect: Rect, face: Face): void {
  switch (face) {
    case "left":
      b.x = rect.x0 - BALL_R;
      if (b.vx > 0) b.vx = -b.vx;
      break;
    case "right":
      b.x = rect.x1 + BALL_R;
      if (b.vx < 0) b.vx = -b.vx;
      break;
    case "top":
      b.y = rect.y0 - BALL_R;
      if (b.vy > 0) b.vy = -b.vy;
      break;
    case "bottom":
      b.y = rect.y1 + BALL_R;
      if (b.vy < 0) b.vy = -b.vy;
      break;
  }
}

function paddleRect(side: Side, paddle: PaddleState): Rect {
  return {
    x0: side === "left" ? P1_X0 : P2_X0,
    x1: side === "left" ? P1_X1 : P2_X1,
    y0: paddle.cy - PADDLE_HALF,
    y1: paddle.cy + PADDLE_HALF,
  };
}

function paddleBounce(b: Mutable, side: Side, paddle: PaddleState): void {
  const offset = clamp((b.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(b.vx, b.vy) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  b.vx = dir * speed * Math.cos(theta);
  b.vy = speed * Math.sin(theta);
  b.spin = clamp(
    b.spin + paddle.vy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  b.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

export interface BallStep {
  readonly ball: BallState;
  readonly events: BallEvents;
}

/** Advances a flying ball by one frame, in sub-steps of at most MAX_SUBSTEP. */
export function stepBall(
  ball: BallState,
  paddles: { readonly left: PaddleState; readonly right: PaddleState },
  obstacles: readonly ObstacleState[],
  dt: number,
): BallStep {
  const b: Mutable = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const startSpeed = Math.hypot(b.vx, b.vy);
  const n = Math.max(1, Math.ceil((startSpeed * dt) / MAX_SUBSTEP));
  const h = dt / n;
  let paddleHit = false;
  let wallBounce = false;
  let obstacleBounce = false;

  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const angle = (b.spin / speed) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const vx = b.vx * cos - b.vy * sin;
      b.vy = b.vx * sin + b.vy * cos;
      b.vx = vx;
    }
    b.spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
    b.x += b.vx * h;
    b.y += b.vy * h;

    if (b.y - BALL_R < 0 && b.vy < 0) {
      b.y = BALL_R;
      b.vy = -b.vy;
      wallBounce = true;
    } else if (b.y + BALL_R > FIELD_H && b.vy > 0) {
      b.y = FIELD_H - BALL_R;
      b.vy = -b.vy;
      wallBounce = true;
    }

    for (const side of ["left", "right"] as const) {
      const paddle = paddles[side];
      const rect = paddleRect(side, paddle);
      const face = struckFace(b, rect);
      if (face === null) continue;
      if (face === "left" || face === "right") {
        paddleBounce(b, side, paddle);
        paddleHit = true;
      } else {
        resolveFace(b, rect, face);
        wallBounce = true;
      }
    }

    for (const obstacle of obstacles) {
      const rect: Rect = {
        x0: obstacle.cx - OBSTACLE_HW,
        x1: obstacle.cx + OBSTACLE_HW,
        y0: obstacle.cy - OBSTACLE_HH,
        y1: obstacle.cy + OBSTACLE_HH,
      };
      const face = struckFace(b, rect);
      if (face === null) continue;
      resolveFace(b, rect, face);
      obstacleBounce = true;
    }
  }

  return {
    ball: { ...ball, ...b },
    events: { paddleHit, wallBounce, obstacleBounce },
  };
}
