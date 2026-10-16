import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { trace, uciOf } from '../src/chess/game.ts';
import { checkGame } from '../src/chess/gameCheck.ts';
import { Repertoire } from '../src/chess/repertoire.ts';
import { movesOfPgn } from '../src/chesscom.ts';

const built = new URL('../public/repertoire.json', import.meta.url);
const skip = !existsSync(built);

function uciLine(sans: string): string[] {
  const pos = Chess.default();
  return sans.split(' ').map(san => {
    const move = parseSan(pos, san)!;
    const uci = uciOf(pos, move as never);
    pos.play(move);
    return uci;
  });
}

function check(side: 'white' | 'black', sans: string) {
  const rep = new Repertoire(JSON.parse(readFileSync(built, 'utf8')));
  const path = uciLine(sans);
  return checkGame(rep, side, undefined, path, trace(path).keys);
}

test('a move that leaves the repertoire is flagged with the repertoire move', { skip }, () => {
  const { flags } = check('white', 'e4 c6 d4 d5 exd5 cxd5');
  assert.deepEqual(flags.slice(0, 4), [undefined, undefined, undefined, undefined]);
  const flag = flags[4];
  assert.equal(flag?.kind, 'left');
  assert.ok(flag.kind === 'left' && flag.expected.some(move => move.san === 'e5'));
});

test('a move the notes call a mistake is flagged as one', { skip }, () => {
  const { flags } = check('white', 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Qf3 Nc6 Bb5 Nxc3 bxc3');
  assert.equal(flags[12]?.kind, 'mistake');
  assert.equal(flags.filter(Boolean).length, 1);
});

test('a move that would have transposed back into the notes is flagged', { skip }, () => {
  const { flags } = check('white', 'Nc3 e5 d4 exd4');
  assert.equal(flags[0]?.kind, 'left');
  const flag = flags[2];
  assert.equal(flag?.kind, 'missed');
  assert.ok(flag.kind === 'missed' && flag.moves.some(move => move.san === 'e4'));
});

test("the opponent's move out of the notes is the exit, and nothing is flagged", { skip }, () => {
  const { flags, exit } = check('white', 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Qf3 Nc6 Bb5 Nxc3 dxc3 a5 a4');
  assert.equal(flags.filter(Boolean).length, 0);
  assert.equal(exit?.mine, false);
});

test('a chess.com PGN is read as UCI with castling as king-takes-rook', () => {
  const pgn = `[Event "Live Chess"]
[White "a"]
[Black "b"]
[Result "1-0"]

1. e4 {[%clk 0:02:59.9]} 1... e5 {[%clk 0:02:59.2]} 2. Nf3 {[%clk 0:02:58]} 2... Nc6 3. Bc4 Bc5 4. O-O Nf6 1-0`;
  assert.deepEqual(movesOfPgn(pgn), ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1h1', 'g8f6']);
});
