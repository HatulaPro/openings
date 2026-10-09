import type { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { type BookData, decodeBook } from './bookFormat.ts';
import { uciOf } from './game.ts';
import { posKey } from './poskey.ts';

/** A move played in at least this share of games counts as a normal book move. */
export const COMMON_SHARE = 0.1;

export interface Stats {
  white: number;
  draws: number;
  black: number;
  total: number;
}

export interface BookMove {
  move: NormalMove;
  uci: string;
  san: string;
  /** Results of the games that reached the position after this move. */
  stats: Stats;
  /** This move's fraction of the games across all book moves in the position. */
  share: number;
}

export type Quality = 'main' | 'common' | 'rare' | 'out';

const PROMOTIONS = ['queen', 'knight', 'rook', 'bishop'] as const;

export function legalMoves(pos: Chess): NormalMove[] {
  const moves: NormalMove[] = [];
  for (const [from, dests] of pos.allDests()) {
    const pawn = pos.board.pawn.has(from);
    for (const to of dests) {
      if (pawn && (to >= 56 || to < 8)) {
        for (const promotion of PROMOTIONS) moves.push({ from, to, promotion });
      } else {
        moves.push({ from, to });
      }
    }
  }
  return moves;
}

export class Book {
  private readonly data: BookData;

  constructor(buf: ArrayBuffer) {
    this.data = decodeBook(buf);
  }

  get games(): number {
    return this.data.games;
  }

  get minGames(): number {
    return this.data.minGames;
  }

  get positions(): number {
    return this.data.keys.length;
  }

  stats(key: number): Stats | undefined {
    const { keys, white, draws, black } = this.data;
    let lo = 0;
    let hi = keys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const value = keys[mid]!;
      if (value < key) lo = mid + 1;
      else if (value > key) hi = mid - 1;
      else {
        const w = white[mid]!;
        const d = draws[mid]!;
        const b = black[mid]!;
        return { white: w, draws: d, black: b, total: w + d + b };
      }
    }
    return undefined;
  }

  /**
   * The moves from this position that lead to a book position, most played
   * first. The book is keyed by position, so a move's count includes games
   * that reached the same position by another move order.
   */
  moves(pos: Chess): BookMove[] {
    const found: BookMove[] = [];
    let sum = 0;
    for (const move of legalMoves(pos)) {
      const child = pos.clone();
      child.play(move);
      const stats = this.stats(posKey(child));
      if (!stats) continue;
      sum += stats.total;
      found.push({ move, uci: uciOf(pos, move), san: makeSan(pos, move), stats, share: 0 });
    }
    for (const entry of found) entry.share = entry.stats.total / sum;
    return found.sort((a, b) => b.stats.total - a.stats.total);
  }
}

export function qualityOf(moves: readonly BookMove[], uci: string): { quality: Quality; share: number } {
  const index = moves.findIndex(entry => entry.uci === uci);
  if (index === -1) return { quality: 'out', share: 0 };
  const share = moves[index]!.share;
  if (index === 0) return { quality: 'main', share };
  return { quality: share >= COMMON_SHARE ? 'common' : 'rare', share };
}
