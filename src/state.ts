// Carom — whole-state builders: the title-screen state and the match start.

import { OBSTACLE_CENTERS } from "./constants";
import type { CaromState, Mode } from "./game";
import { centeredPaddle, obstacleAt, parkBall } from "./world";

/** The state at the title screen; `simTime`, `titleIndex` and `muted` carry. */
export function titleState(
  simTime: number,
  titleIndex: number,
  muted: boolean,
): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: titleIndex,
    titleIndex,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: centeredPaddle(), right: centeredPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkBall(),
    obstacles: OBSTACLE_CENTERS.map((_, i) => obstacleAt(i as 0 | 1)),
    simTime,
    muted,
    presses: [],
  };
}

/** Starts a match in `mode`: a countdown over a parked ball and level scores. */
export function startMatch(
  state: Readonly<CaromState>,
  mode: Mode,
): CaromState {
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkBall(),
    paddles: {
      left: { ...state.paddles.left, cy: centeredPaddle().cy, vy: 0 },
      right: { ...state.paddles.right, cy: centeredPaddle().cy, vy: 0 },
    },
  };
}

/** Back to the title, keeping `titleIndex`, `simTime` and `muted`. */
export function returnToTitle(state: Readonly<CaromState>): CaromState {
  return titleState(state.simTime, state.titleIndex, state.muted);
}
