import type { Key } from '@lichess-org/chessground/types';
import { castlingSide, Chess, normalizeMove } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { isNormal, type NormalMove } from 'chessops/types';
import { kingCastlesTo, makeSquare, makeUci, parseUci } from 'chessops/util';
import { posKey } from './poskey.ts';

export type Color = 'white' | 'black';

/** One played move, with everything the board needs to show it. */
export interface Step {
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  squares: [Key, Key];
}

export function fenOf(pos: Chess): string {
  return makeFen(pos.toSetup());
}

/** Parses one of our own UCI strings, which always come from legal games. */
export function moveFromUci(uci: string): NormalMove {
  const move = parseUci(uci);
  if (!move || !isNormal(move)) throw new Error(`bad move ${uci}`);
  return move;
}

/** UCI with castling written as king-takes-rook, the form used throughout the data. */
export function uciOf(pos: Chess, move: NormalMove): string {
  return makeUci(normalizeMove(pos, move));
}

/** The squares to highlight for a move. Castling is shown as the king's two-square step. */
export function moveSquares(pos: Chess, move: NormalMove): [Key, Key] {
  const side = castlingSide(pos, move);
  const to = side ? kingCastlesTo(pos.turn, side) : move.to;
  return [makeSquare(move.from), makeSquare(to)];
}

/** Plays the move on `pos` and returns the record of it. */
export function playStep(pos: Chess, move: NormalMove): Step {
  const fenBefore = fenOf(pos);
  const uci = uciOf(pos, move);
  const san = makeSan(pos, move);
  const squares = moveSquares(pos, move);
  pos.play(move);
  return { uci, san, fenBefore, fenAfter: fenOf(pos), squares };
}

export function positionAfter(ucis: readonly string[]): Chess {
  const pos = Chess.default();
  for (const uci of ucis) pos.play(moveFromUci(uci));
  return pos;
}

/** "12." before a White move, "12..." before a Black one. */
export function moveNumber(ply: number): string {
  return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}`;
}

export function formatGames(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatShare(share: number): string {
  const percent = share * 100;
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

/** The record of every move in a line played from the starting position. */
export function replay(ucis: readonly string[]): Step[] {
  const pos = Chess.default();
  return ucis.map(uci => playStep(pos, moveFromUci(uci)));
}

/** A line replayed: the record of every move, and the key of the position before each move and after the last. */
export function trace(ucis: readonly string[]): { steps: Step[]; keys: number[] } {
  const pos = Chess.default();
  const keys = [posKey(pos)];
  const steps = ucis.map(uci => {
    const step = playStep(pos, moveFromUci(uci));
    keys.push(posKey(pos));
    return step;
  });
  return { steps, keys };
}

/** The end of a move list, cut at a move number so it fits in about `max` characters. */
export function pgnTail(pgn: string, max = 38): string {
  if (pgn.length <= max) return pgn;
  const tokens = pgn.split(' ');
  let start = tokens.length;
  let length = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    length += tokens[i]!.length + 1;
    if (length > max) break;
    if (tokens[i]!.endsWith('.')) start = i;
  }
  return `… ${tokens.slice(start).join(' ')}`;
}
