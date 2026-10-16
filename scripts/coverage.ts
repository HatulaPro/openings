// How far recent chess.com games stay in the notes, and which moves they meet
// once they leave them: the list that decides what the repertoire covers next.
//
//   pnpm coverage [--user name] [--months 6] [--refresh]
//       per side, how many games stay in the notes to move 6 and move 8, and
//       the moves most games leave the notes with
//   pnpm coverage tree <white|black> [SAN moves ...] [--min 3] [--depth 8]
//       the moves played from a position in the games of that side, with how
//       often each was played and whether the notes have the position after it
//
// Games are read from chess.com's public API and kept in data/games/ (not in
// git). Positions are matched by their contents, so transpositions count.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import { type Color, moveFromUci, trace, uciOf } from '../src/chess/game.ts';
import { posKey } from '../src/chess/poskey.ts';
import { Repertoire } from '../src/chess/repertoire.ts';
import { movesOfPgn } from '../src/chesscom.ts';

const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const [value] = args.splice(at, 2).slice(1);
  return value ?? fallback;
}
const refresh = args.includes('--refresh') && args.splice(args.indexOf('--refresh'), 1).length > 0;
const user = option('user', 'hatulapro').toLowerCase();
const months = Number(option('months', '6'));
const minGames = Number(option('min', '3'));
const maxDepth = Number(option('depth', '8'));

interface Game {
  side: Color;
  moves: string[];
  keys: number[];
}

const gamesDir = fileURLToPath(new URL('../data/games/', import.meta.url));
const cache = `${gamesDir}${user}-${months}m.json`;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

interface ApiGame {
  rules: string;
  pgn?: string;
  white: { username: string };
}

async function loadGames(): Promise<Game[]> {
  let raw: ApiGame[];
  if (!refresh && existsSync(cache)) raw = JSON.parse(readFileSync(cache, 'utf8'));
  else {
    const base = `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`;
    const { archives } = await fetchJson<{ archives: string[] }>(base);
    raw = [];
    for (const archive of archives.slice(-months)) raw.push(...(await fetchJson<{ games: ApiGame[] }>(archive)).games);
    mkdirSync(gamesDir, { recursive: true });
    writeFileSync(cache, JSON.stringify(raw));
  }
  const games: Game[] = [];
  for (const api of raw) {
    if (api.rules !== 'chess' || !api.pgn) continue;
    const moves = movesOfPgn(api.pgn);
    if (!moves || moves.length < 6) continue;
    const side: Color = api.white.username.toLowerCase() === user ? 'white' : 'black';
    games.push({ side, moves, keys: trace(moves).keys });
  }
  return games;
}

function sanLine(moves: readonly string[]): string {
  const pos = Chess.default();
  return moves
    .map((uci, ply) => {
      const move = moveFromUci(uci);
      const san = makeSan(pos, move);
      pos.play(move);
      return ply % 2 === 0 ? `${ply / 2 + 1}.${san}` : san;
    })
    .join(' ');
}

const rep = new Repertoire(JSON.parse(readFileSync(new URL('../public/repertoire.json', import.meta.url), 'utf8')));
const games = await loadGames();
const percent = (part: number, whole: number) => `${whole ? Math.round((100 * part) / whole) : 0}%`;

if (args[0] === 'tree') tree(args[1] as Color, args.slice(2));
else summary();

/** The first ply whose position the notes do not have (the game's length if they have all of them). */
function exitPly(game: Game): number {
  for (let ply = 1; ply <= game.moves.length; ply++) if (!rep.at(game.side, game.keys[ply]!)) return ply;
  return game.moves.length + 1;
}

function summary(): void {
  console.log(`${games.length} games of ${user} from the last ${months} months\n`);
  for (const side of ['white', 'black'] as const) {
    const mine = games.filter(game => game.side === side);
    // A game that ended inside the notes counts as staying in them.
    const reached = (moves: number) => mine.filter(game => exitPly(game) > Math.min(2 * moves, game.moves.length)).length;
    console.log(
      `As ${side}: ${mine.length} games; in the notes to move 4: ${percent(reached(4), mine.length)}, ` +
        `move 6: ${percent(reached(6), mine.length)}, move 8: ${percent(reached(8), mine.length)}`,
    );
  }
  const exits = new Map<string, { count: number; mine: boolean; side: Color }>();
  for (const game of games) {
    const ply = exitPly(game);
    if (ply > game.moves.length) continue;
    const key = `${game.side}|${sanLine(game.moves.slice(0, ply))}`;
    const mine = (ply - 1) % 2 === (game.side === 'white' ? 0 : 1);
    const entry = exits.get(key) ?? { count: 0, mine, side: game.side };
    entry.count++;
    exits.set(key, entry);
  }
  console.log('\nWhere games leave the notes (the last move is the one the notes do not have):');
  for (const [key, { count, mine, side }] of [...exits].sort((a, b) => b[1].count - a[1].count).slice(0, 40)) {
    console.log(`${String(count).padStart(4)}  ${side.padEnd(5)}  ${mine ? 'my move  ' : 'their move'}  ${key.split('|')[1]}`);
  }
}

function tree(side: Color, sans: string[]): void {
  if (side !== 'white' && side !== 'black') throw new Error('usage: pnpm coverage tree <white|black> [SAN moves ...]');
  const start = Chess.default();
  const prefix: string[] = [];
  for (const san of sans) {
    const move = parseSan(start, san.replace(/^\d+\.+/, ''));
    if (!move) throw new Error(`not a legal move here: ${san}`);
    prefix.push(uciOf(start, move as never));
    start.play(move);
  }
  const mine = games.filter(game => game.side === side);
  // Each game enters at the first time it reaches the position, whatever the move order.
  const startKey = posKey(start);
  const entries = mine.flatMap(game => {
    const ply = game.keys.indexOf(startKey);
    return ply === -1 ? [] : [{ game, ply }];
  });
  console.log(`${entries.length} of ${mine.length} games as ${side} reach ${sanLine(prefix) || 'the start'}`);
  console.log(`(+ the notes have the position after the move, - they do not; their moves marked >)\n`);
  walk(start, entries, 0, '');

  function walk(pos: Chess, at: { game: Game; ply: number }[], depth: number, indent: string): void {
    if (depth >= maxDepth) return;
    const groups = new Map<string, { game: Game; ply: number }[]>();
    for (const entry of at) {
      const uci = entry.game.moves[entry.ply];
      if (!uci) continue;
      const list = groups.get(uci) ?? [];
      list.push({ game: entry.game, ply: entry.ply + 1 });
      groups.set(uci, list);
    }
    const theirs = pos.turn !== side;
    for (const [uci, next] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      if (next.length < minGames) continue;
      const child = pos.clone();
      const move = moveFromUci(uci);
      const san = makeSan(pos, move);
      child.play(move);
      const covered = rep.at(side, posKey(child)) ? '+' : '-';
      const number = pos.turn === 'white' ? `${pos.fullmoves}.` : `${pos.fullmoves}...`;
      console.log(`${indent}${covered} ${theirs ? '>' : ' '} ${number}${san}  ${next.length} (${percent(next.length, at.length)})`);
      walk(child, next, depth + 1, `${indent}    `);
    }
  }
}
