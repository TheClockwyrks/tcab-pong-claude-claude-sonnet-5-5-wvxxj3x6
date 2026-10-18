import { describe, expect, it } from "vitest";
import { CAROM_DEBUG_VERSION, HOLD_TIME } from "./constants";
import { makeRig } from "./harness";

async function surface() {
  const rig = await makeRig();
  const { debug } = rig.engine;
  const snap = () => debug.snapshot(rig.engine.state);
  return { rig, debug, snap };
}

describe("debug surface", () => {
  it("reports its version and a full snapshot", async () => {
    const { debug, snap } = await surface();
    expect(debug.version).toBe(CAROM_DEBUG_VERSION);
    const s = snap();
    expect(s.version).toBe(1);
    expect(s.ball?.speed).toBe(0);
    expect(s.paddles.left).toEqual({
      cy: 360,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
  });

  it("sets and reads back every field", async () => {
    const { rig, debug, snap } = await surface();
    const apply = rig.engine.apply.bind(rig.engine);
    apply((s) => debug.setScreen(s, "paused"));
    apply((s) => debug.setMode(s, "versus"));
    apply((s) => debug.setMenuIndex(s, 2));
    apply((s) => debug.setTitleIndex(s, 1));
    apply((s) => debug.setResumeScreen(s, "countdown"));
    apply((s) => debug.setScore(s, 4, 7));
    apply((s) => debug.setWinner(s, "right"));
    apply((s) => debug.setReceiver(s, "right"));
    apply((s) => debug.setPaddleCy(s, "right", 100));
    apply((s) => debug.setPaddleVy(s, "left", -300));
    apply((s) => debug.setPaddleDriven(s, "left", true));
    apply((s) => debug.setBallPosition(s, 10, 20));
    apply((s) => debug.setBallVelocity(s, 30, 40));
    apply((s) => debug.setBallSpin(s, 50));
    apply((s) => debug.setBallHeld(s, false));
    apply((s) => debug.setBallHoldTimer(s, 0.5));
    apply((s) => debug.setBallServeSign(s, -1));
    apply((s) => debug.setAiTracking(s, false));
    apply((s) => debug.setAiMovement(s, false));
    apply((s) => debug.setMuted(s, true));
    const s = snap();
    expect(s).toMatchObject({
      screen: "paused",
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      score: { p1: 4, p2: 7 },
      winner: "right",
      receiver: "right",
      muted: true,
      ai: { tracking: false, movement: false },
    });
    expect(s.paddles.right.cy).toBe(100);
    expect(s.paddles.left).toMatchObject({ drivenVy: -300, driven: true });
    expect(s.ball).toMatchObject({
      x: 10,
      y: 20,
      vx: 30,
      vy: 40,
      speed: 50,
      spin: 50,
      held: false,
      holdTimer: 0.5,
      serveSign: -1,
    });
  });

  it("moves a driven paddle at its driven velocity", async () => {
    const { rig, debug, snap } = await surface();
    rig.engine.apply((s) => debug.setScreen(s, "playing"));
    rig.engine.apply((s) => debug.setPaddleDriven(s, "left", true));
    rig.engine.apply((s) => debug.setPaddleVy(s, "left", 300));
    await rig.engine.advance(6);
    expect(snap().paddles.left.vy).toBe(300);
    expect(snap().paddles.left.cy).toBeCloseTo(360 + 300 * 0.1, 3);
  });

  it("clears and respawns the world", async () => {
    const { rig, debug, snap } = await surface();
    rig.engine.apply((s) => debug.clearWorld(s));
    expect(snap().ball).toBeNull();
    expect(snap().obstacles).toEqual([]);
    rig.engine.apply((s) => debug.spawnObstacle(s, 1));
    rig.engine.apply((s) => debug.spawnObstacle(s, 0));
    rig.engine.apply((s) => debug.spawnObstacle(s, 0));
    expect(snap().obstacles.map((o) => o.index)).toEqual([0, 1]);
    rig.engine.apply((s) => debug.spawnBall(s));
    expect(snap().ball?.holdTimer).toBe(HOLD_TIME);
  });

  it("fails loudly instead of refusing quietly", async () => {
    const { rig, debug } = await surface();
    const state = rig.engine.state;
    expect(() => debug.spawnObstacle(state, 2)).toThrow();
    expect(() => debug.setBallServeSign(state, 0 as 1)).toThrow();
    expect(() => debug.setScreen(state, "nowhere" as "title")).toThrow();
    expect(() => debug.setMode(state, "co-op" as "solo")).toThrow();
    expect(() => debug.setResumeScreen(state, "title" as "playing")).toThrow();
    const empty = debug.clearWorld(state);
    expect(() => debug.setBallSpin(empty, 1)).toThrow();
    expect(() => debug.setBallPosition(empty, 1, 1)).toThrow();
  });

  it("draws serve signs of both kinds", async () => {
    const { rig, debug } = await surface();
    const signs = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const next = debug.drawBallServeSign(rig.engine.state);
      signs.add(next.ball?.serveSign ?? 0);
    }
    expect(signs).toEqual(new Set([1, -1]));
  });

  it("resets to the title but keeps the mute bit, and reconcile is inert", async () => {
    const { rig, debug, snap } = await surface();
    rig.engine.apply((s) => debug.setScore(s, 3, 3));
    rig.engine.apply((s) => debug.setMuted(s, true));
    rig.engine.apply((s) => debug.setTitleIndex(s, 2));
    const before = snap();
    rig.engine.apply((s) => debug.reconcile(s));
    expect(snap()).toEqual(before);
    rig.engine.apply((s) => debug.reset(s));
    expect(snap()).toMatchObject({
      screen: "title",
      score: { p1: 0, p2: 0 },
      muted: true,
      titleIndex: 0,
      simTime: 0,
    });
  });

  it("reports menu regions only where a menu is showing", async () => {
    const { rig, debug } = await surface();
    const state = rig.engine.state;
    expect(debug.menuItemRect(state, 0)).toMatchObject({ w: 340 });
    expect(debug.menuItemRect(state, 3)).toBeNull();
    const playing = debug.setScreen(state, "playing");
    expect(debug.menuItemRect(playing, 0)).toBeNull();
  });
});
