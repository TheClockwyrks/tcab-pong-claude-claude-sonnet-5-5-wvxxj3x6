// Carom — drawing. Everything is drawn in code, in logical field units, from the
// state alone.

import type { RenderApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_CX,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  TITLE_TEXT,
  WIN_SCORE,
} from "./constants";
import type { CaromState, PaddleState } from "./game";
import { itemRect, menuItems } from "./menu";

type State = DeepReadonly<CaromState>;
type Ctx = CanvasRenderingContext2D;

const COLORS = {
  left: "#38e1ff",
  right: "#ff5c8a",
  ball: "#fff6d6",
  obstacle: "#ffc247",
  text: "#e8ecff",
  dim: "#7f89b5",
  net: "#2a3358",
  panel: "rgba(8, 11, 22, 0.86)",
};
const FONT = "'Trebuchet MS', 'Segoe UI', sans-serif";

function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = "bold",
  align: CanvasTextAlign = "center",
): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function glowRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  roundedRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function drawBackdrop(ctx: Ctx): void {
  const g = ctx.createRadialGradient(FIELD_CX, 360, 80, FIELD_CX, 360, 760);
  g.addColorStop(0, "#111833");
  g.addColorStop(1, "#060810");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.strokeStyle = "#1b2447";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, FIELD_W - 4, FIELD_H - 4);
}

function drawNet(ctx: Ctx): void {
  ctx.save();
  ctx.strokeStyle = COLORS.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 8);
  ctx.lineTo(NET_X, FIELD_H - 8);
  ctx.stroke();
  ctx.restore();
}

function drawPaddle(
  ctx: Ctx,
  paddle: DeepReadonly<PaddleState>,
  x: number,
  color: string,
): void {
  glowRect(ctx, x, paddle.cy - PADDLE_H / 2, PADDLE_W, PADDLE_H, 7, color);
}

function drawTrail(ctx: Ctx, state: State): void {
  const trail = state.ball?.trail ?? [];
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const segments = trail.length - 1;
  for (let i = 1; i <= segments; i++) {
    const k = i / segments;
    ctx.strokeStyle = `rgba(255, 246, 214, ${(0.55 * k).toFixed(3)})`;
    ctx.lineWidth = BALL_R * 2 * k;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawField(ctx: Ctx, state: State): void {
  drawBackdrop(ctx);
  drawNet(ctx);
  for (const o of state.obstacles) {
    glowRect(
      ctx,
      o.cx - OBSTACLE_W / 2,
      o.cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      8,
      COLORS.obstacle,
    );
  }
  drawPaddle(ctx, state.paddles.left, P1_X0, COLORS.left);
  drawPaddle(ctx, state.paddles.right, P2_X0, COLORS.right);
  drawTrail(ctx, state);
  if (state.ball) {
    ctx.save();
    ctx.shadowColor = COLORS.ball;
    ctx.shadowBlur = 20;
    ctx.fillStyle = COLORS.ball;
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function modeLabel(state: State): string {
  return state.mode === "solo" ? "SOLO  ·  VS CPU" : "VERSUS  ·  2 PLAYERS";
}

function drawHud(ctx: Ctx, state: State): void {
  text(ctx, String(state.score.p1), FIELD_CX - 140, 56, 64, COLORS.left);
  text(ctx, String(state.score.p2), FIELD_CX + 140, 56, 64, COLORS.right);
  text(ctx, modeLabel(state), FIELD_CX, 700, 18, COLORS.dim);
  text(ctx, `FIRST TO ${WIN_SCORE}`, FIELD_CX, 24, 14, COLORS.dim);
}

function drawMenu(ctx: Ctx, state: State): void {
  const items = menuItems(state.screen);
  items.forEach((label, i) => {
    const r = itemRect(state.screen, i);
    if (!r) return;
    const selected = i === state.menuIndex;
    ctx.save();
    if (selected) {
      ctx.shadowColor = COLORS.left;
      ctx.shadowBlur = 16;
      ctx.fillStyle = COLORS.left;
    } else {
      ctx.fillStyle = "#161d3a";
    }
    roundedRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.restore();
    text(
      ctx,
      label,
      r.x + r.w / 2,
      r.y + r.h / 2 + 1,
      26,
      selected ? "#06101c" : COLORS.text,
    );
  });
}

function dimLayer(ctx: Ctx, alpha: number): void {
  ctx.fillStyle = `rgba(6, 8, 16, ${alpha})`;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawTitle(ctx: Ctx, state: State): void {
  dimLayer(ctx, 0.72);
  ctx.save();
  ctx.shadowColor = COLORS.left;
  ctx.shadowBlur = 30;
  text(ctx, TITLE_TEXT, FIELD_CX, 210, 150, COLORS.text, "900");
  ctx.restore();
  text(ctx, "SPIN IT. BANK IT. SCORE IT.", FIELD_CX, 310, 24, COLORS.right);
  drawMenu(ctx, state);
  text(ctx, "W / S  ·  ↑ / ↓  ·  ENTER", FIELD_CX, 640, 16, COLORS.dim);
}

const HOWTO_LINES: readonly (readonly [string, string])[] = [
  [
    "MOVE",
    "Player 1: W / S.  Player 2: ↑ / ↓.  In Solo either pair moves you.",
  ],
  ["MENUS", "Enter or Space confirms, Esc or P pauses, M mutes."],
  ["SPIN", "A paddle on the move when it strikes the ball bends its flight."],
  ["", "Hit while moving down to curve it clockwise, up for the other way."],
  [
    "BANKS",
    "Two bars stand mid-field. Bounce the ball off them and the walls.",
  ],
  ["WIN", "First to 11 points, leading by at least 2, takes the match."],
];

function drawHowTo(ctx: Ctx, state: State): void {
  dimLayer(ctx, 0.88);
  text(ctx, "HOW TO PLAY", FIELD_CX, 90, 56, COLORS.text, "900");
  HOWTO_LINES.forEach(([head, body], i) => {
    const y = 190 + i * 62;
    text(ctx, head, 190, y, 22, COLORS.obstacle, "bold", "left");
    text(ctx, body, 330, y, 22, COLORS.text, "normal", "left");
  });
  drawMenu(ctx, state);
}

function drawCountdown(ctx: Ctx, state: State): void {
  const ball = state.ball;
  const left = ball ? Math.max(0, ball.holdTimer) : 0;
  text(ctx, "GET READY", FIELD_CX, 160, 36, COLORS.text);
  ctx.save();
  ctx.strokeStyle = COLORS.ball;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(
    FIELD_CX,
    360,
    38,
    -Math.PI / 2,
    -Math.PI / 2 + (Math.PI * 2 * left) / HOLD_TIME,
  );
  ctx.stroke();
  ctx.restore();
}

function drawPaused(ctx: Ctx, state: State): void {
  dimLayer(ctx, 0.6);
  text(ctx, "PAUSED", FIELD_CX, 240, 80, COLORS.text, "900");
  drawMenu(ctx, state);
}

function drawMatchOver(ctx: Ctx, state: State): void {
  dimLayer(ctx, 0.72);
  const left = state.winner === "left";
  const color = left ? COLORS.left : COLORS.right;
  const who = left ? "LEFT" : "RIGHT";
  text(ctx, `${who} WINS`, FIELD_CX, 190, 96, color, "900");
  text(
    ctx,
    `${state.score.p1}  –  ${state.score.p2}`,
    FIELD_CX,
    310,
    64,
    COLORS.text,
  );
  text(ctx, "FINAL SCORE", FIELD_CX, 365, 16, COLORS.dim);
  drawMenu(ctx, state);
}

export function drawGame(state: State, api: RenderApi): void {
  const ctx = api.ctx;
  drawField(ctx, state);
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      return;
    case "howto":
      drawHowTo(ctx, state);
      return;
    case "countdown":
      drawHud(ctx, state);
      drawCountdown(ctx, state);
      return;
    case "playing":
      drawHud(ctx, state);
      return;
    case "paused":
      drawHud(ctx, state);
      drawPaused(ctx, state);
      return;
    case "matchover":
      drawHud(ctx, state);
      drawMatchOver(ctx, state);
      return;
  }
}
