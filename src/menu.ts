// Carom — menu layout and menu input. The same rectangles drive both the
// drawing and the pointer hit tests, so what is drawn is what can be clicked.

import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { Screen } from "./game";

export interface ItemRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const HOWTO_ITEMS = ["BACK"] as const;

const ITEM_W = 340;
const ITEM_H = 56;
const ITEM_PITCH = 70;

/** Top of the first item, per menu screen. */
const MENU_TOP: Partial<Record<Screen, number>> = {
  title: 380,
  howto: 610,
  paused: 330,
  matchover: 420,
};

/** The items of the menu a screen shows; empty when it shows none. */
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    default:
      return [];
  }
}

/** The hit region of an item, or `null` when the screen has no such item. */
export function itemRect(screen: Screen, index: number): ItemRect | null {
  const top = MENU_TOP[screen];
  if (top === undefined || !Number.isInteger(index)) return null;
  if (index < 0 || index >= menuItems(screen).length) return null;
  return {
    x: FIELD_CX - ITEM_W / 2,
    y: top + index * ITEM_PITCH,
    w: ITEM_W,
    h: ITEM_H,
  };
}

/** The index of the item whose region holds the point, or `null`. */
export function itemAt(screen: Screen, x: number, y: number): number | null {
  const count = menuItems(screen).length;
  for (let i = 0; i < count; i++) {
    const r = itemRect(screen, i);
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return null;
}

/** Wraps `index + delta` over `count` items. */
export function wrap(index: number, delta: number, count: number): number {
  return (((index + delta) % count) + count) % count;
}
