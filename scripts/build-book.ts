// Builds data/book-full.bin from the Lichess Elite Database zips in data/raw.
//
// For every position reached in the first --max-ply plies of a game, the book
// stores how many games reached it and how they ended. Positions seen in fewer
// than --min-games games are dropped.
//
// Almost all positions are seen once, so counting them exactly would need
// gigabytes. Pass 1 counts approximately in a sketch (it can overcount, never
// undercount); pass 2 counts exactly, but only for positions the sketch says
// might reach the threshold.
//
//   pnpm data:book [--min-games 3] [--max-ply 60] [--out data/book-full.bin] [zip files...]

import { createReadStream, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { Unzip, UnzipInflate } from 'fflate';
import { encodeBook } from '../src/chess/bookFormat.ts';
import { posKey } from '../src/chess/poskey.ts';

const WHITE = 0;
const DRAW = 1;
const BLACK = 2;

type Visit = (key: number, result: number) => void;

const root = new URL('../', import.meta.url);
const { values, positionals } = parseArgs({
  options: {
    'min-games': { type: 'string', default: '3' },
    'max-ply': { type: 'string', default: '60' },
    out: { type: 'string' },
  },
  allowPositionals: true,
});
const minGames = Number(values['min-games']);
const maxPly = Number(values['max-ply']);
const outFile = values.out ?? fileURLToPath(new URL('data/book-full.bin', root));
if (!(minGames >= 1 && minGames <= 255)) throw new Error('--min-games must be 1..255');
if (!(maxPly >= 1)) throw new Error('--max-ply must be at least 1');

const rawDir = fileURLToPath(new URL('data/raw/', root));
const files = positionals.length
  ? positionals
  : readdirSync(rawDir)
      .filter(name => name.endsWith('.zip'))
      .sort()
      .map(name => rawDir + name);
if (!files.length) throw new Error(`no zip files in ${rawDir}`);

/** Calls onChunk with the decompressed bytes of every .pgn inside the zip. */
function streamZip(path: string, onChunk: (data: Uint8Array) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = file => {
      if (!file.name.endsWith('.pgn')) return;
      file.ondata = (err, data) => {
        if (err) reject(err);
        else onChunk(data);
      };
      file.start();
    };
    const stream = createReadStream(path, { highWaterMark: 1 << 20 });
    stream.on('data', chunk => unzip.push(chunk as Buffer, false));
    stream.on('end', () => {
      unzip.push(new Uint8Array(0), true);
      resolve();
    });
    stream.on('error', reject);
  });
}

/** Replays the opening of every game, reporting each position it reaches. */
async function scan(label: string, visit: Visit): Promise<number> {
  const pos = Chess.default();
  let games = 0;
  let result = -1;
  let skip = false;
  let movetext = '';
  // Enough text for maxPly moves; later lines of a game are not kept.
  const textBudget = maxPly * 12;

  const flush = () => {
    if (movetext && result >= 0 && !skip) {
      games++;
      const text = movetext.includes('{') ? movetext.replace(/\{[^}]*\}/g, ' ') : movetext;
      pos.reset();
      visit(posKey(pos), result);
      let ply = 0;
      for (const token of text.split(' ')) {
        if (token === '') continue;
        const first = token.charCodeAt(0);
        let san = token;
        if (first >= 48 && first <= 57) {
          // A move number like "12." or "12...", or a result like "1-0".
          const dot = token.lastIndexOf('.');
          if (dot === -1) break;
          san = token.slice(dot + 1);
          if (san === '') continue;
        } else if (first === 42 /* * */) {
          break;
        } else if (first === 36 /* $ */) {
          continue;
        }
        const move = parseSan(pos, san);
        if (!move) break;
        pos.play(move);
        visit(posKey(pos), result);
        if (++ply >= maxPly) break;
      }
    }
    movetext = '';
    result = -1;
    skip = false;
  };

  const onLine = (line: string) => {
    if (line.charCodeAt(0) === 91 /* [ */ && line.charCodeAt(1) !== 37 /* % */) {
      if (movetext) flush();
      if (line.startsWith('[Result "')) {
        const value = line.slice(9, line.indexOf('"', 9));
        result = value === '1-0' ? WHITE : value === '1/2-1/2' ? DRAW : value === '0-1' ? BLACK : -1;
      } else if (line.startsWith('[FEN ') || (line.startsWith('[Variant ') && !line.includes('Standard'))) {
        skip = true;
      }
    } else if (line !== '' && movetext.length < textBudget) {
      movetext = movetext ? movetext + ' ' + line : line;
    }
  };

  for (const file of files) {
    const started = Date.now();
    const before = games;
    let tail = '';
    await streamZip(file, data => {
      const text = tail + Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('latin1');
      let start = 0;
      for (;;) {
        const newline = text.indexOf('\n', start);
        if (newline === -1) break;
        const end = text.charCodeAt(newline - 1) === 13 ? newline - 1 : newline;
        onLine(text.slice(start, Math.max(start, end)));
        start = newline + 1;
      }
      tail = text.slice(start);
    });
    if (tail) onLine(tail);
    flush();
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`${label}: ${basename(file)}  ${games - before} games  ${seconds}s`);
  }
  return games;
}

// Pass 1: rows of saturating one-byte counters, each indexed by a different
// hash of the key. A position's true count is at most its smallest cell, and
// only the smallest cells are incremented, which keeps the overcount low
// enough for thresholds down to 2 or 3.
const ROW_BITS = 28;
const ROW_SEEDS = [0x9e3779b1, 0x7feb352d, 0x846ca68b, 0x27d4eb2f];
const rows = ROW_SEEDS.map(() => new Uint8Array(2 ** ROW_BITS));
const cells = new Int32Array(rows.length);

/** Fills `cells` with the key's cell in each row and returns the smallest counter. */
function locate(key: number): number {
  const lo = key % 0x100000000 | 0;
  const hi = (key / 0x100000000) | 0;
  let min = 255;
  for (let r = 0; r < rows.length; r++) {
    let h = lo ^ Math.imul(hi + r + 1, ROW_SEEDS[r]!);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    const cell = h >>> (32 - ROW_BITS);
    cells[r] = cell;
    const value = rows[r]![cell]!;
    if (value < min) min = value;
  }
  return min;
}

await scan('pass 1', key => {
  const min = locate(key);
  if (min === 255) return;
  for (let r = 0; r < rows.length; r++) {
    if (rows[r]![cells[r]!] === min) rows[r]![cells[r]!]!++;
  }
});

// Pass 2: exact results for the candidates.
const index = new Map<number, number>();
const counts: number[] = [];
const games = await scan('pass 2', (key, result) => {
  if (locate(key) < minGames) return;
  let i = index.get(key);
  if (i === undefined) {
    i = counts.length;
    index.set(key, i);
    counts.push(0, 0, 0);
  }
  counts[i + result]!++;
});

const kept: { key: number; i: number }[] = [];
for (const [key, i] of index) {
  if (counts[i]! + counts[i + 1]! + counts[i + 2]! >= minGames) kept.push({ key, i });
}
kept.sort((a, b) => a.key - b.key);

const bytes = encodeBook({
  games,
  minGames,
  keys: Float64Array.from(kept, entry => entry.key),
  white: Uint32Array.from(kept, entry => counts[entry.i + WHITE]!),
  draws: Uint32Array.from(kept, entry => counts[entry.i + DRAW]!),
  black: Uint32Array.from(kept, entry => counts[entry.i + BLACK]!),
});
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, bytes);
console.log(
  `${games} games, ${index.size} candidates, ${kept.length} positions kept, ` +
    `${(bytes.length / 1048576).toFixed(1)} MB -> ${outFile}`,
);
