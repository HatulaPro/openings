import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Chess } from 'chessops/chess';
import { moveFromUci } from '../src/chess/game.ts';
import { posKey } from '../src/chess/poskey.ts';
import { Repertoire } from '../src/chess/repertoire.ts';

const built = new URL('../public/repertoire.json', import.meta.url);

// Checks the training mode against the real chapters: starting from a chapter's
// own position and following only the moves training can play, every position
// the chapter wants learned has to come up.
test('training reaches every position a chapter asks about', { skip: !existsSync(built) }, () => {
  const rep = new Repertoire(JSON.parse(readFileSync(built, 'utf8')));
  assert.ok(rep.chapters.length > 0);
  for (const chapter of rep.chapters) {
    const pos = Chess.default();
    for (const uci of chapter.lines[0]!.main.slice(0, chapter.root)) pos.play(moveFromUci(uci));

    const seen = new Set<number>();
    const asked = new Set<number>();
    const stack = [{ key: posKey(pos), mine: pos.turn === chapter.side }];
    while (stack.length) {
      const { key, mine } = stack.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      const options = rep.options(chapter, key);
      if (mine && options.length) asked.add(key);
      for (const move of options) stack.push({ key: move.to, mine: !mine });
    }

    const wanted = rep.puzzles(chapter).map(puzzle => puzzle.key);
    const missed = wanted.filter(key => !asked.has(key));
    assert.equal(missed.length, 0, `${chapter.id}: ${missed.length} of ${wanted.length} positions never come up`);
    assert.equal(asked.size, wanted.length, `${chapter.id}: training asks about positions the chapter does not list`);
  }
});
