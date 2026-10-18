// Carom — test harness: the real engine over a napi canvas and a constant clock.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import { BACKGROUND, game } from "./game";
import type { CaromDebugApi, CaromState } from "./game";

export type CaromEngine = Engine<CaromState, CaromDebugApi>;

export interface Rig {
  readonly engine: CaromEngine;
  readonly events: EventTarget;
}

export async function makeRig(stepMs = 1000 / 60): Promise<Rig> {
  const events = new EventTarget();
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  return { engine, events };
}

export function key(rig: Rig, type: "keydown" | "keyup", code: string): void {
  rig.events.dispatchEvent(
    Object.assign(new Event(type), { code, repeat: false }),
  );
}

/** Taps a key across one frame. */
export async function tap(rig: Rig, code: string): Promise<void> {
  key(rig, "keydown", code);
  await rig.engine.advance(1);
  key(rig, "keyup", code);
}

export function pointer(
  rig: Rig,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
  pointerType = "mouse",
  pointerId = 1,
): void {
  rig.events.dispatchEvent(
    Object.assign(new Event(type), {
      clientX: x,
      clientY: y,
      pointerId,
      pointerType,
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    }),
  );
}
