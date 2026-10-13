import { useSyncExternalStore } from 'react';
import type { Color } from './chess/game';
import type { Chapter, Repertoire, RepMove } from './chess/repertoire';
import type { Drill } from './progress';

// Where the repertoire gives more than one move, which of them are drilled and
// how often each has been played, kept between sessions. The opponent's replies
// have no such setting: every one the notes prepare for is always trained.

/**
 * How a move of a choice is trained. The main move comes up most, the others
 * in rotation; a move that is off is neither asked nor counted, and nor is
 * anything only it leads to.
 */
export type Role = 'main' | 'also' | 'off';

/** How much more often training asks for the main move than for each of the others. */
export const MAIN_WEIGHT = 2;

export const ROLE_LABEL: Record<Role, string> = { main: 'Main', also: 'Also', off: 'Off' };

const STORAGE_KEY = 'openings.choices';

interface Stored {
  /** Position id to the setting of each move that has been changed, by UCI. */
  roles: Record<string, Record<string, Role>>;
  /** Position id to how many times each move was played there in training. */
  played: Record<string, Record<string, number>>;
}

let cache: Stored | undefined;
let version = 0;
const listeners = new Set<() => void>();

function load(): Stored {
  if (cache) return cache;
  cache = { roles: {}, played: {} };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Stored> | null;
    if (stored && typeof stored === 'object') {
      if (stored.roles && typeof stored.roles === 'object') cache.roles = stored.roles;
      if (stored.played && typeof stored.played === 'object') cache.played = stored.played;
    }
  } catch {
    // Nothing remembered.
  }
  return cache;
}

function save(): void {
  version++;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(load()));
  } catch {
    // Without storage the settings still last for this session.
  }
  for (const listener of listeners) listener();
}

const idOf = (side: Color, key: number) => `${side[0]}${key}`;

/** Re-renders when a setting or a count changes; the value only changes with them. */
export function useChoices(): number {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}

/** A move's setting. Until it is changed, the move the notes give first is the main one. */
export function roleOf(rep: Repertoire, side: Color, key: number, uci: string): Role {
  const stored = load().roles[idOf(side, key)]?.[uci];
  if (stored) return stored;
  return rep.repertoireMoves(side, key)[0]?.uci === uci ? 'main' : 'also';
}

/** Every repertoire move of a choice with its setting and how often it was played. */
export function choiceAt(rep: Repertoire, side: Color, key: number): { move: RepMove; role: Role; played: number }[] {
  const played = load().played[idOf(side, key)] ?? {};
  return rep
    .repertoireMoves(side, key)
    .map(move => ({ move, role: roleOf(rep, side, key, move.uci), played: played[move.uci] ?? 0 }));
}

/**
 * Changes a move's setting. There is at most one main move, so making one main
 * makes the old one "also"; and the last move still trained cannot be turned off.
 */
export function setRole(rep: Repertoire, side: Color, key: number, uci: string, role: Role): void {
  const moves = choiceAt(rep, side, key);
  if (role === 'off' && !moves.some(entry => entry.move.uci !== uci && entry.role !== 'off')) return;
  const roles: Record<string, Role> = {};
  for (const entry of moves) roles[entry.move.uci] = entry.role === 'main' && role === 'main' ? 'also' : entry.role;
  roles[uci] = role;
  load().roles[idOf(side, key)] = roles;
  save();
}

/** Whether a move is turned off. Only a move of a choice can be. */
export function isOff(rep: Repertoire, side: Color, key: number, uci: string): boolean {
  return rep.isChoice(side, key) && roleOf(rep, side, key, uci) === 'off';
}

export function recordPlayed(side: Color, key: number, uci: string): void {
  const played = (load().played[idOf(side, key)] ??= {});
  played[uci] = (played[uci] ?? 0) + 1;
  save();
}

/**
 * What training a chapter (or one line of it) asks: one drill per position,
 * or per move where the position is a choice. Training a whole chapter leaves
 * out the moves that are off and what lies behind them; training one line
 * asks for its moves whatever their setting.
 */
export function drillsOf(rep: Repertoire, chapter: Chapter, line?: number): Drill[] {
  const side = chapter.side;
  const skip = line === undefined ? (key: number, uci: string) => isOff(rep, side, key, uci) : undefined;
  return rep.puzzles(chapter, line, skip).flatMap(puzzle =>
    rep.isChoice(side, puzzle.key)
      ? puzzle.answers.map(answer => ({
          key: puzzle.key,
          uci: answer.uci,
          line: puzzle.line,
          legacy: roleOf(rep, side, puzzle.key, answer.uci) === 'main',
        }))
      : [{ key: puzzle.key, line: puzzle.line }],
  );
}

/** The drill for one move from a position. */
export function drillOf(rep: Repertoire, side: Color, key: number, uci: string): Drill {
  return rep.isChoice(side, key) ? { key, uci, legacy: roleOf(rep, side, key, uci) === 'main' } : { key };
}
