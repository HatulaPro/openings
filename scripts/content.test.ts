import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { LineData, MoveKind, NodeData } from '../src/chess/repertoireFormat.ts';
import { walkLine } from '../src/chess/repertoireFormat.ts';
import { loadChapter } from './lib/content.ts';
import { parsePgn } from './lib/pgn.ts';

const game = (moves: string) => `[Line "Test"]\n[Summary "Test."]\n\n${moves}\n`;

test('the PGN reader builds the tree of moves, variations, glyphs and comments', () => {
  const { games, problems } = parsePgn(game('1. e4 e5 ( 1... c5 2. Nf3 ) 2. Nf3! { Develops. } 2... Nc6 $2 *'));
  assert.deepEqual(problems, []);
  const e4 = games[0]!.moves[0]!;
  assert.equal(e4.san, 'e4');
  assert.deepEqual(e4.children.map(node => node.san), ['e5', 'c5']);
  assert.equal(e4.children[1]!.children[0]!.san, 'Nf3');
  const nf3 = e4.children[0]!.children[0]!;
  assert.equal(nf3.glyph, '!');
  assert.deepEqual(nf3.comments, [' Develops. ']);
  assert.equal(nf3.children[0]!.glyph, '?');
  assert.equal(nf3.children[0]!.number, '2...');
});

test('the PGN reader rejects what it cannot read instead of skipping it', () => {
  const garbled = parsePgn(game('1. e4 e5\n2. Nf33 *'));
  assert.equal(garbled.games.length, 0);
  assert.equal(garbled.problems[0]!.line, 5);
  assert.match(garbled.problems[0]!.message, /Nf33/);

  assert.match(parsePgn(game('1. e4 e5')).problems[0]!.message, /does not end/);
  assert.match(parsePgn(game('1. e4 ( 1. d4 *')).problems[0]!.message, /\)/);
});

test('a broken game does not take the next one with it', () => {
  const { games, problems } = parsePgn(game('1. e4 oops *') + '\n' + game('1. d4 *'));
  assert.equal(problems.length, 1);
  assert.equal(games.length, 1);
  assert.equal(games[0]!.moves[0]!.san, 'd4');
});

test('moves are classified by where they sit in the tree', () => {
  const node = (san: string, next?: NodeData[], glyph?: NodeData['glyph']): NodeData => ({ uci: san, san, glyph, next });
  // 1. e4 e5 (1... c5) 2. Nf3 (2. Qh5?! Nc6) (2. Nc3 Nf6 3. f4)
  const line: LineData = {
    name: 'Test',
    section: '',
    summary: '',
    moves: [
      node('e4', [
        node('e5', [node('Nf3'), node('Qh5', [node('Nc6')], '?!'), node('Nc3', [node('Nf6', [node('f4')])])]),
        node('c5'),
      ]),
    ],
  };
  const kinds = new Map<string, MoveKind>();
  walkLine(line, 'white', ({ node: visited, kind }) => kinds.set(visited.san, kind));
  assert.deepEqual(Object.fromEntries(kinds), {
    e4: 'repertoire',
    e5: 'reply',
    Nf3: 'repertoire',
    Qh5: 'mistake',
    Nc6: 'shown',
    Nc3: 'alternative',
    Nf6: 'shown',
    f4: 'shown',
    c5: 'reply',
  });
});

test('the example chapter passes the checker', () => {
  const dir = fileURLToPath(new URL('../content/_example/', import.meta.url));
  const { chapter, issues, stats } = loadChapter(dir, '_example');
  assert.deepEqual(issues, []);
  assert.equal(chapter?.side, 'white');
  assert.equal(stats.lines, 2);
  assert.ok(chapter!.sections.some(section => section.moves && section.shapes));
});
