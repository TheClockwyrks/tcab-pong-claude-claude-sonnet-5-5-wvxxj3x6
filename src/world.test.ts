import { describe, expect, it } from "vitest";
import {
  BALL_R,
  FIELD_H,
  OBSTACLE_CENTERS,
  P1_X1,
  P2_X0,
  PADDLE_MAX_CY,
  SERVE_SPEED,
  SPEED_CAP,
  TRAIL_TIME,
} from "./constants";
import type { BallState, PaddleState } from "./game";
import {
  aiVelocity,
  centeredPaddle,
  movePaddle,
  obstacleAt,
  parkBall,
  recordTrail,
  serve,
  stepBall,
} from "./world";

const paddles = { left: centeredPaddle(), right: centeredPaddle() };
const fly = (change: Partial<BallState>): BallState => ({
  ...parkBall(),
  held: false,
  ...change,
});
const obstacles = [obstacleAt(0), obstacleAt(1)];
const speedOf = (b: BallState) => Math.hypot(b.vx, b.vy);

describe("paddles", () => {
  it("clamps and reports the actual velocity", () => {
    const p: PaddleState = { ...centeredPaddle(), cy: 660 };
    const moved = movePaddle(p, 720, 0.1);
    expect(moved.cy).toBe(PADDLE_MAX_CY);
    expect(moved.vy).toBeCloseTo((PADDLE_MAX_CY - 660) / 0.1);
    expect(movePaddle({ ...p, cy: PADDLE_MAX_CY }, 720, 0.1).vy).toBe(0);
  });
});

describe("the AI", () => {
  it("heads home when idle and chases an incoming ball", () => {
    const incoming = fly({ x: 400, y: 100, vx: 500, vy: 0 });
    expect(aiVelocity(360, incoming, true, true, 1 / 60)).toBeLessThan(0);
    expect(aiVelocity(360, incoming, true, false, 1 / 60)).toBe(0);
    expect(aiVelocity(360, incoming, false, true, 1 / 60)).toBe(0);
    expect(aiVelocity(200, null, true, true, 1 / 60)).toBeGreaterThan(0);
  });

  it("never exceeds its top speed", () => {
    expect(aiVelocity(60, fly({ y: 700, vx: 10 }), true, true, 0.001)).toBe(
      560,
    );
  });
});

describe("serving and trails", () => {
  it("serves at the serve speed toward the receiver", () => {
    const b = serve({ ...parkBall(), serveSign: -1 }, "left");
    expect(speedOf(b)).toBeCloseTo(SERVE_SPEED);
    expect(b.vx).toBeLessThan(0);
    expect(b.vy).toBeLessThan(0);
    expect(b.held).toBe(false);
  });

  it("drops trail samples older than the trail time", () => {
    let b = parkBall();
    for (let i = 0; i < 30; i++) b = recordTrail(b, i * 0.02);
    expect(b.trail[b.trail.length - 1].t - b.trail[0].t).toBeLessThanOrEqual(
      TRAIL_TIME + 1e-9,
    );
  });
});

describe("ball physics", () => {
  it("reflects off the walls without changing speed", () => {
    const { ball, events } = stepBall(
      fly({ x: 300, y: 12, vx: 100, vy: -600 }),
      paddles,
      [],
      0.05,
    );
    expect(events.wallBounce).toBe(true);
    expect(ball.vy).toBeGreaterThan(0);
    expect(ball.y).toBeGreaterThanOrEqual(BALL_R);
    const low = stepBall(
      fly({ x: 300, y: FIELD_H - 12, vy: 600 }),
      paddles,
      [],
      0.05,
    );
    expect(low.ball.vy).toBeLessThan(0);
  });

  it("bounces off a paddle face with more speed and the paddle's spin", () => {
    const moving = { ...paddles, left: { ...paddles.left, vy: 400 } };
    const { ball, events } = stepBall(
      fly({ x: P1_X1 + BALL_R + 2, y: 360, vx: -500, vy: 0 }),
      moving,
      [],
      0.01,
    );
    expect(events.paddleHit).toBe(true);
    expect(ball.vx).toBeGreaterThan(0);
    expect(speedOf(ball)).toBeCloseTo(520, 0);
    expect(ball.spin).toBeGreaterThan(330);
    expect(ball.spin).toBeLessThanOrEqual(340);
  });

  it("sends the ball off the paddle edge at the maximum angle", () => {
    const { ball } = stepBall(
      fly({ x: P2_X0 - BALL_R - 1, y: 360 + 55, vx: 500, vy: 0 }),
      paddles,
      [],
      0.005,
    );
    expect(ball.vx).toBeLessThan(0);
    expect(Math.atan2(ball.vy, -ball.vx)).toBeCloseTo((55 * Math.PI) / 180, 1);
  });

  it("caps the speed", () => {
    const { ball } = stepBall(
      fly({ x: P2_X0 - BALL_R - 1, y: 360, vx: 975, vy: 0 }),
      paddles,
      [],
      0.005,
    );
    expect(speedOf(ball)).toBeCloseTo(SPEED_CAP);
  });

  it("treats a paddle end cap like a wall", () => {
    const { ball, events } = stepBall(
      fly({ x: 56, y: 360 + 55 + BALL_R + 1, vx: 0, vy: -300 }),
      paddles,
      [],
      0.01,
    );
    expect(events.wallBounce).toBe(true);
    expect(events.paddleHit).toBe(false);
    expect(ball.vy).toBeGreaterThan(0);
  });

  it("bounces off obstacles and leaves speed and spin alone", () => {
    const c = OBSTACLE_CENTERS[0];
    const { ball, events } = stepBall(
      fly({ x: c.x - 10 - BALL_R - 1, y: c.y, vx: 600, vy: 0, spin: 0 }),
      paddles,
      obstacles,
      0.01,
    );
    expect(events.obstacleBounce).toBe(true);
    expect(ball.vx).toBeLessThan(0);
    expect(speedOf(ball)).toBeCloseTo(600);
  });

  it("curves under spin and decays it by half in the half-life", () => {
    const { ball } = stepBall(
      fly({ x: 300, y: 300, vx: 400, vy: 0, spin: 800 }),
      paddles,
      [],
      0.8,
    );
    expect(ball.spin).toBeCloseTo(400, 0);
    expect(speedOf(ball)).toBeCloseTo(400);
    expect(ball.vy).not.toBe(0);
  });

  it("plays out the same under different step sizes", () => {
    const run = (dt: number) => {
      let b = fly({ x: 300, y: 300, vx: 450, vy: 200, spin: 500 });
      for (let t = 0; t < 0.5 - 1e-9; t += dt) {
        b = stepBall(b, paddles, obstacles, dt).ball;
      }
      return b;
    };
    const a = run(0.002);
    const b = run(0.016);
    expect(Math.abs(speedOf(a) - speedOf(b))).toBeLessThan(10);
    expect(Math.abs(a.vx - b.vx)).toBeLessThan(40);
  });

  it("does not move a stationary ball", () => {
    const { ball } = stepBall(parkBall(), paddles, obstacles, 0.1);
    expect(ball.x).toBe(640);
  });
});
