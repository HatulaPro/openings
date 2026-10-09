import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BookMove } from '../src/chess/book.ts';
import { pickReply } from '../src/chess/replies.ts';

function bookMoves(games: Record<string, number>): BookMove[] {
  const sum = Object.values(games).reduce((a, b) => a + b, 0);
  return Object.entries(games).map(
    ([uci, total]) => ({ uci, share: total / sum, stats: { total } }) as BookMove,
  );
}

test('with no history, moves are picked in proportion to their games', () => {
  const moves = bookMoves({ main: 70, side: 30 });
  assert.equal(pickReply(moves, {}, () => 0.69).uci, 'main');
  assert.equal(pickReply(moves, {}, () => 0.71).uci, 'side');
});

test('a move that is ahead of its share becomes less likely', () => {
  const moves = bookMoves({ main: 70, side: 30 });
  // After one game with the main move it is owed 0.4 of the next game, the sideline 0.6.
  assert.equal(pickReply(moves, { main: 1 }, () => 0.39).uci, 'main');
  assert.equal(pickReply(moves, { main: 1 }, () => 0.41).uci, 'side');
});

test('a move far ahead of its share is not picked at all', () => {
  const moves = bookMoves({ main: 70, side: 30 });
  for (const roll of [0, 0.5, 0.999]) {
    assert.equal(pickReply(moves, { main: 5 }, () => roll).uci, 'side');
  }
});

test('moves below the minimum share are never played', () => {
  const moves = bookMoves({ main: 99, odd: 1 });
  for (const roll of [0, 0.5, 0.999]) {
    assert.equal(pickReply(moves, {}, () => roll).uci, 'main');
  }
});

test('over many games every move stays close to its share', () => {
  const games = { a: 60, b: 25, c: 10, d: 5 };
  const moves = bookMoves(games);
  const tally: Record<string, number> = {};
  for (let played = 1; played <= 200; played++) {
    const { uci } = pickReply(moves, tally);
    tally[uci] = (tally[uci] ?? 0) + 1;
    for (const [move, share] of Object.entries(games)) {
      const expected = (share / 100) * played;
      assert.ok(
        Math.abs((tally[move] ?? 0) - expected) <= moves.length,
        `${move} played ${tally[move] ?? 0} times after ${played} games, expected about ${expected}`,
      );
    }
  }
});
