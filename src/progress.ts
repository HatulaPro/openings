import type { Color } from './chess/game';

// How well each position's repertoire move is known, kept between sessions.
// Only recent answers count. A position holds how many times in a row its move
// was found at the first attempt and when it was last asked: a miss puts it
// back to zero, and a known position fades when it has not been asked for a
// while, the later the more often it was found.

/** First-attempt answers in a row after which a position counts as known. */
export const KNOWN = 2;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Days a known position stays solid without being asked, by its answers in a row. */
const HOLD_DAYS = [0, 0, 4, 10, 25, 60];
const MAX_STREAK = HOLD_DAYS.length - 1;
/** Once known, repeating a position within this time does not add to its answers in a row. */
const SPACING = 8 * HOUR;

const STORAGE_KEY = 'openings.progress';

/** First-attempt answers in a row, and when the position was last asked. */
export type Entry = [streak: number, at: number];

export type Standing = 'solid' | 'learning' | 'fading' | 'missed' | 'untested';

type Entries = Record<string, Entry>;
let cache: Entries | undefined;

function load(): Entries {
  if (cache) return cache;
  cache = {};
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [id, value] of Object.entries(stored)) {
        // Scores saved before answers were dated are taken as answered now.
        if (typeof value === 'number') cache[id] = [value, Date.now()];
        else if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') cache[id] = [value[0], value[1]];
      }
    }
  } catch {
    // Nothing remembered.
  }
  return cache;
}

// The same position can be in a White chapter and a Black one, with different moves to find.
const idOf = (side: Color, key: number) => `${side[0]}${key}`;

/** The entry after one more answer. */
export function answered(prev: Entry | undefined, firstAttempt: boolean, now: number): Entry {
  if (!firstAttempt) return [0, now];
  if (!prev) return [1, now];
  const counts = prev[0] < KNOWN || now - prev[1] >= SPACING;
  return [Math.min(MAX_STREAK, prev[0] + (counts ? 1 : 0)), now];
}

export function standingAt(entry: Entry | undefined, now: number): Standing {
  if (!entry) return 'untested';
  const [streak, at] = entry;
  if (streak <= 0) return 'missed';
  if (streak < KNOWN) return 'learning';
  return now - at > HOLD_DAYS[Math.min(streak, MAX_STREAK)]! * DAY ? 'fading' : 'solid';
}

export function standingOf(side: Color, key: number, now = Date.now()): Standing {
  return standingAt(load()[idOf(side, key)], now);
}

export function recordAnswer(side: Color, key: number, firstAttempt: boolean): void {
  const entries = load();
  const id = idOf(side, key);
  entries[id] = answered(entries[id], firstAttempt, Date.now());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Without storage the answers still last for this session.
  }
}

/** How many positions of a set are in each standing. */
export interface Mastery extends Record<Standing, number> {
  total: number;
  /** When one of the positions was last asked. */
  last?: number;
}

export function masteryOf(side: Color, keys: readonly number[], now = Date.now()): Mastery {
  const mastery: Mastery = { solid: 0, learning: 0, fading: 0, missed: 0, untested: 0, total: keys.length };
  const entries = load();
  for (const key of keys) {
    const entry = entries[idOf(side, key)];
    mastery[standingAt(entry, now)]++;
    if (entry && entry[1] > (mastery.last ?? 0)) mastery.last = entry[1];
  }
  return mastery;
}

export interface Level {
  label: string;
  tone: '' | 'good' | 'warn' | 'bad';
}

/**
 * One word for how far a set of positions can be trusted. It is only "Solid"
 * when nearly all of them are, so a few good answers in a large chapter do not
 * pass for knowing it.
 */
export function levelOf(mastery: Mastery): Level {
  const { total, solid, fading, missed } = mastery;
  const tested = total - mastery.untested;
  if (!tested) return { label: 'Not tested', tone: '' };
  if (solid >= 0.9 * total) return { label: 'Solid', tone: 'good' };
  if (tested < 0.5 * total) return { label: 'Started', tone: '' };
  if (missed >= 0.2 * tested) return { label: 'Shaky', tone: 'bad' };
  if (solid + fading >= 0.9 * total) return { label: 'Rusty', tone: 'warn' };
  return { label: 'Learning', tone: '' };
}

/** How much a set of positions needs another look: misses first, then what is fading. */
export function needOf(mastery: Mastery): number {
  return mastery.missed * 2 + mastery.fading;
}

/** "today", "yesterday" or "5 days ago". */
export function ago(at: number, now = Date.now()): string {
  const days = Math.floor((now - at) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
