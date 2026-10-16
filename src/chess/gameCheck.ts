import { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import { legalMoves } from './book.ts';
import { type Color, moveFromUci, uciOf } from './game.ts';
import { posKey } from './poskey.ts';
import { rankMoves, type RepMove, type Repertoire, viewOf } from './repertoire.ts';

/** A move that would have reached a position the repertoire aims for. */
export interface Transposition {
  uci: string;
  san: string;
  /** The repertoire move that leads to the same position. */
  aimed: RepMove;
}

export type Flag =
  /** The notes call the move a mistake. */
  | { kind: 'mistake' }
  /** The notes have a repertoire move here and something else was played. */
  | { kind: 'left'; expected: RepMove[] }
  /** The notes do not have this position, but another move would have reached a position of the repertoire. */
  | { kind: 'missed'; moves: Transposition[] };

export interface GameCheck {
  /** One entry per move; only the side's own moves are flagged. */
  flags: (Flag | undefined)[];
  /**
   * The move after which the game never came back to the notes, if it left
   * them, and whether the side itself played it.
   */
  exit?: { ply: number; mine: boolean };
}

/** Transpositions are only looked for in the opening: later, a repertoire position is a coincidence. */
const TRANSPOSE_PLIES = 40;

const moverOf = (ply: number): Color => (ply % 2 === 0 ? 'white' : 'black');

function transpositions(rep: Repertoire, side: Color, pos: Chess): Transposition[] {
  const found: Transposition[] = [];
  for (const move of legalMoves(pos)) {
    const child = pos.clone();
    child.play(move);
    const aimed = rep.aimedAt(side, posKey(child));
    if (aimed) found.push({ uci: uciOf(pos, move), san: makeSan(pos, move), aimed });
  }
  return found;
}

/**
 * Compares a game with one side's notes. A move of the side is flagged where
 * the notes call it a mistake, where the notes had a repertoire move and
 * another was played (a second choice they allow included), and where the
 * game was already outside the notes but a different move would have brought
 * it back into them.
 *
 * `keys` are the position keys of the game, before each move and after the last.
 */
export function checkGame(
  rep: Repertoire,
  side: Color,
  scope: number | undefined,
  path: readonly string[],
  keys: readonly number[],
): GameCheck {
  const pos = Chess.default();
  let lastCovered = -1;
  const flags = path.map((uci, ply): Flag | undefined => {
    const flag = flagOf(ply, uci);
    pos.play(moveFromUci(uci));
    return flag;
  });

  function flagOf(ply: number, uci: string): Flag | undefined {
    const here = rep.at(side, keys[ply]!);
    if (here) lastCovered = ply;
    if (moverOf(ply) !== side) return undefined;
    const move = rep.move(side, keys[ply]!, uci);
    const kind = move && viewOf(move, scope).kind;
    if (kind === 'mistake') return { kind: 'mistake' };
    if (kind === 'repertoire') return undefined;
    // A second choice the notes allow still leaves the repertoire.
    const expected = here ? rankMoves(here.moves, scope).filter(row => row.view.kind === 'repertoire') : [];
    if (expected.length) return { kind: 'left', expected: expected.map(row => row.move) };
    if (move) return undefined;
    if (ply >= TRANSPOSE_PLIES || rep.at(side, keys[ply + 1]!)) return undefined;
    const moves = transpositions(rep, side, pos);
    return moves.length ? { kind: 'missed', moves } : undefined;
  }

  if (lastCovered === -1 || rep.at(side, keys[path.length]!)) return { flags };
  return { flags, exit: { ply: lastCovered, mine: moverOf(lastCovered) === side } };
}

/** How a flag shows in the move list. */
export const toneOf = (flag: Flag | undefined): 'bad' | 'warn' | undefined =>
  flag && (flag.kind === 'mistake' ? 'bad' : 'warn');
