import { pawnAttacks } from 'chessops/attacks';
import type { Position } from 'chessops/chess';
import { opposite } from 'chessops/util';

// Shared by the app and the book build script: both must derive the same key
// for the same position, so the book can be looked up without storing FENs.

const words = new Int32Array(17);

function murmur3(seed: number): number {
  let h = seed | 0;
  for (let i = 0; i < words.length; i++) {
    let k = words[i]!;
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= words.length * 4;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The en passant square, but only when an en passant capture is actually legal. */
function legalEpSquare(pos: Position): number | undefined {
  if (pos.epSquare === undefined) return undefined;
  const ctx = pos.ctx();
  const candidates = pos.board
    .pieces(pos.turn, 'pawn')
    .intersect(pawnAttacks(opposite(pos.turn), pos.epSquare));
  for (const from of candidates) {
    if (pos.dests(from, ctx).has(pos.epSquare)) return pos.epSquare;
  }
  return undefined;
}

/**
 * A 53-bit key identifying a position up to transposition: piece placement,
 * side to move, castling rights and (legal) en passant square. It fits a JS
 * number exactly, so keys can live in a Float64Array.
 */
export function posKey(pos: Position): number {
  const b = pos.board;
  words[0] = b.white.lo;
  words[1] = b.white.hi;
  words[2] = b.pawn.lo;
  words[3] = b.pawn.hi;
  words[4] = b.knight.lo;
  words[5] = b.knight.hi;
  words[6] = b.bishop.lo;
  words[7] = b.bishop.hi;
  words[8] = b.rook.lo;
  words[9] = b.rook.hi;
  words[10] = b.queen.lo;
  words[11] = b.queen.hi;
  words[12] = b.king.lo;
  words[13] = b.king.hi;
  words[14] = pos.castles.castlingRights.lo;
  words[15] = pos.castles.castlingRights.hi;
  const ep = legalEpSquare(pos);
  words[16] = (pos.turn === 'white' ? 0 : 1) | ((ep === undefined ? 0 : ep + 1) << 1);
  return (murmur3(0x9747b28c) & 0x1fffff) * 0x100000000 + murmur3(0x3c6ef372);
}
