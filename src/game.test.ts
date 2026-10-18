import { describe, expect, it } from "vitest";
import { CUES, HOLD_TIME, TITLE_ITEMS, WIN_SCORE } from "./constants";
import { key, makeRig, pointer, tap } from "./harness";
import type { Rig } from "./harness";

const snap = (rig: Rig) => rig.engine.debug.snapshot(rig.engine.state);

async function startSolo(rig: Rig): Promise<void> {
  await tap(rig, "Enter");
}

describe("title screen", () => {
  it("opens on the title with the declared values", async () => {
    const rig = await makeRig();
    const s = snap(rig);
    expect(s.screen).toBe("title");
    expect(s.mode).toBe("solo");
    expect(s.ball?.held).toBe(true);
    expect(s.ball?.holdTimer).toBe(HOLD_TIME);
    expect(s.obstacles).toHaveLength(2);
    expect(s.ai).toEqual({ tracking: true, movement: true });
    expect(s.muted).toBe(false);
  });

  it("wraps the menu up and down, up winning over down", async () => {
    const rig = await makeRig();
    await tap(rig, "KeyW");
    expect(snap(rig).menuIndex).toBe(TITLE_ITEMS.length - 1);
    await tap(rig, "ArrowDown");
    expect(snap(rig).menuIndex).toBe(0);
    key(rig, "keydown", "KeyW");
    key(rig, "keydown", "KeyS");
    await rig.engine.advance(1);
    expect(snap(rig).menuIndex).toBe(TITLE_ITEMS.length - 1);
  });

  it("starts versus and remembers the title selection", async () => {
    const rig = await makeRig();
    await tap(rig, "KeyS");
    await tap(rig, "Space");
    const s = snap(rig);
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("versus");
    expect(s.titleIndex).toBe(1);
    expect(s.menuIndex).toBe(0);
  });

  it("opens and leaves the how-to screen", async () => {
    const rig = await makeRig();
    await tap(rig, "KeyW");
    await tap(rig, "Enter");
    expect(snap(rig).screen).toBe("howto");
    await tap(rig, "Escape");
    const s = snap(rig);
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(2);
  });

  it("ignores back on the title", async () => {
    const rig = await makeRig();
    await tap(rig, "Escape");
    expect(snap(rig).screen).toBe("title");
  });
});

describe("pause", () => {
  it("opens on one Escape and resumes on the next", async () => {
    const rig = await makeRig();
    await startSolo(rig);
    await tap(rig, "Escape");
    expect(snap(rig).screen).toBe("paused");
    const before = snap(rig).ball;
    await rig.engine.advance(30);
    expect(snap(rig).ball?.holdTimer).toBe(before?.holdTimer);
    await tap(rig, "Escape");
    expect(snap(rig).screen).toBe("countdown");
  });

  it("restarts and quits from the pause menu", async () => {
    const rig = await makeRig();
    await startSolo(rig);
    await tap(rig, "KeyP");
    await tap(rig, "ArrowDown");
    await tap(rig, "Enter");
    expect(snap(rig).screen).toBe("countdown");
    await tap(rig, "KeyP");
    await tap(rig, "ArrowUp");
    await tap(rig, "Enter");
    expect(snap(rig).screen).toBe("title");
  });
});

describe("a match", () => {
  it("serves after the hold and moves the paddle", async () => {
    const rig = await makeRig();
    await startSolo(rig);
    key(rig, "keydown", "KeyW");
    await rig.engine.advance(90);
    key(rig, "keyup", "KeyW");
    const s = snap(rig);
    expect(s.screen).toBe("playing");
    expect(s.paddles.left.cy).toBe(55);
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.vx).toBeLessThan(0);
  });

  it("scores a point, counts down again and finishes the match", async () => {
    const rig = await makeRig();
    const played: string[] = [];
    rig.engine.events.on("cue:played", (e) => played.push(e.cue));
    await startSolo(rig);
    const d = rig.engine.debug;
    rig.engine.apply((s) => d.setAiMovement(s, false));
    rig.engine.apply((s) => d.setScreen(s, "playing"));
    rig.engine.apply((s) => d.setBallHeld(s, false));
    rig.engine.apply((s) => d.setScore(s, WIN_SCORE - 1, 0));
    rig.engine.apply((s) => d.clearWorld(s));
    rig.engine.apply((s) => d.spawnBall(s));
    rig.engine.apply((s) => d.setBallHeld(s, false));
    rig.engine.apply((s) => d.setBallPosition(s, 1270, 360));
    rig.engine.apply((s) => d.setBallVelocity(s, 600, 0));
    await rig.engine.advance(20);
    const s = snap(rig);
    expect(s.screen).toBe("matchover");
    expect(s.winner).toBe("left");
    expect(played).toContain(CUES.score);
    await tap(rig, "Enter");
    expect(snap(rig).screen).toBe("countdown");
    expect(snap(rig).score).toEqual({ p1: 0, p2: 0 });
  });

  it("returns the serve to the player scored on", async () => {
    const rig = await makeRig();
    await startSolo(rig);
    const d = rig.engine.debug;
    rig.engine.apply((s) => d.setScreen(s, "playing"));
    rig.engine.apply((s) => d.setBallHeld(s, false));
    rig.engine.apply((s) => d.setBallPosition(s, 5, 40));
    rig.engine.apply((s) => d.setBallVelocity(s, -600, 0));
    rig.engine.apply((s) => d.setPaddleCy(s, "left", 600));
    await rig.engine.advance(10);
    const s = snap(rig);
    expect(s.score).toEqual({ p1: 0, p2: 1 });
    expect(s.receiver).toBe("left");
    expect(s.screen).toBe("countdown");
    expect(s.ball?.held).toBe(true);
  });

  it("continues past 10-10 until a two point lead", async () => {
    const rig = await makeRig();
    await startSolo(rig);
    const d = rig.engine.debug;
    rig.engine.apply((s) => d.setScore(s, 10, 10));
    rig.engine.apply((s) => d.setScreen(s, "playing"));
    rig.engine.apply((s) => d.setBallHeld(s, false));
    rig.engine.apply((s) => d.setBallPosition(s, 1270, 40));
    rig.engine.apply((s) => d.setBallVelocity(s, 600, 0));
    await rig.engine.advance(10);
    expect(snap(rig).screen).toBe("countdown");
    expect(snap(rig).score).toEqual({ p1: 11, p2: 10 });
  });
});

describe("mute", () => {
  it("toggles from the key and from the debug surface", async () => {
    const rig = await makeRig();
    await tap(rig, "KeyM");
    expect(snap(rig).muted).toBe(true);
    await tap(rig, "KeyM");
    expect(snap(rig).muted).toBe(false);
    rig.engine.apply((s) => rig.engine.debug.setMuted(s, true));
    await rig.engine.advance(2);
    expect(snap(rig).muted).toBe(true);
  });
});

describe("pointer menus", () => {
  it("selects on move and confirms on press and release", async () => {
    const rig = await makeRig();
    const r = rig.engine.debug.menuItemRect(rig.engine.state, 1);
    if (!r) throw new Error("no rect");
    const x = r.x + r.w / 2;
    const y = r.y + r.h / 2;
    pointer(rig, "pointermove", x, y);
    await rig.engine.advance(1);
    expect(snap(rig).menuIndex).toBe(1);
    pointer(rig, "pointerdown", x, y);
    pointer(rig, "pointerup", x, y);
    await rig.engine.advance(1);
    expect(snap(rig).screen).toBe("countdown");
    expect(snap(rig).mode).toBe("versus");
  });

  it("confirms nothing when press and release land on different items", async () => {
    const rig = await makeRig();
    const a = rig.engine.debug.menuItemRect(rig.engine.state, 0);
    const b = rig.engine.debug.menuItemRect(rig.engine.state, 1);
    if (!a || !b) throw new Error("no rect");
    pointer(rig, "pointerdown", a.x + 5, a.y + 5);
    await rig.engine.advance(1);
    pointer(rig, "pointerup", b.x + 5, b.y + 5);
    await rig.engine.advance(1);
    expect(snap(rig).screen).toBe("title");
  });

  it("confirms a touch that lands and lifts inside one item", async () => {
    const rig = await makeRig();
    const r = rig.engine.debug.menuItemRect(rig.engine.state, 2);
    if (!r) throw new Error("no rect");
    pointer(rig, "pointerdown", r.x + 5, r.y + 5, "touch", 7);
    await rig.engine.advance(1);
    expect(snap(rig).menuIndex).toBe(2);
    pointer(rig, "pointerup", r.x + 5, r.y + 5, "touch", 7);
    await rig.engine.advance(1);
    expect(snap(rig).screen).toBe("howto");
  });
});

describe("diagnostics and rendering", () => {
  it("registers the overlay sources and renders every screen", async () => {
    const rig = await makeRig();
    const names = rig.engine.diagnostics().map((d) => d.name);
    expect(names).toEqual(expect.arrayContaining(["screen", "mode", "score"]));
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const) {
      rig.engine.apply((s) => rig.engine.debug.setScreen(s, screen));
      rig.engine.apply((s) => rig.engine.debug.setWinner(s, "right"));
      await rig.engine.advance(2);
    }
    rig.engine.apply((s) => rig.engine.debug.clearWorld(s));
    await rig.engine.advance(2);
    expect(rig.engine.diagnostics().every((d) => d.error === undefined)).toBe(
      true,
    );
  });
});
