import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { posKey } from '../src/chess/poskey.ts';

function keyAfter(sans: string): number {
  const pos = Chess.default();
  for (const san of sans.split(' ')) {
    const move = parseSan(pos, san);
    assert.ok(move, `illegal move ${san}`);
    pos.play(move);
  }
  return posKey(pos);
}

function keyOfFen(fen: string): number {
  return posKey(Chess.fromSetup(parseFen(fen).unwrap()).unwrap());
}

test('transpositions share a key', () => {
  assert.equal(keyAfter('e4 e5 Nf3 Nc6'), keyAfter('Nf3 Nc6 e4 e5'));
  assert.equal(keyAfter('d4 Nf6 c4 e6 Nc3'), keyAfter('c4 e6 Nc3 Nf6 d4'));
});

test('an en passant square with no legal capture is ignored', () => {
  assert.equal(keyAfter('e4 e5'), keyAfter('e3 e6 e4 e5'));
});

test('a legal en passant capture changes the key', () => {
  const board = 'rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq';
  assert.notEqual(keyOfFen(`${board} d6 0 3`), keyOfFen(`${board} - 0 3`));
});

test('side to move and castling rights change the key', () => {
  const board = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R';
  assert.notEqual(keyOfFen(`${board} w KQkq - 2 3`), keyOfFen(`${board} b KQkq - 2 3`));
  assert.notEqual(keyOfFen(`${board} w KQkq - 2 3`), keyOfFen(`${board} w Qkq - 2 3`));
});

test('same squares, different pieces do not collide', () => {
  // Bishop versus knight on h4 and h8, the top bit of each bitboard half.
  assert.notEqual(
    keyOfFen('4k3/8/8/8/7B/8/8/4K3 w - - 0 1'),
    keyOfFen('4k3/8/8/8/7N/8/8/4K3 w - - 0 1'),
  );
  assert.notEqual(
    keyOfFen('4k2b/8/8/8/8/8/8/4K3 w - - 0 1'),
    keyOfFen('4k2n/8/8/8/8/8/8/4K3 w - - 0 1'),
  );
});
