// Compiles the chapters in content/ into public/repertoire.json, and cuts the
// book of elite games down to the positions the repertoire can reach.
//
//   pnpm data:repertoire [--no-book] [--examples] [--skip-broken]
//
// --examples also builds the folders that start with "_", and --skip-broken
// leaves out chapters with errors instead of stopping.
//
// The trimmed book (public/book.bin) starts from each chapter's root position.
// Where the chapter's side is to move in a position the notes cover, only the
// moves in the notes are followed, so the book keeps everything the opponent
// can try against the repertoire but not the openings the repertoire avoids.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chessops/chess';
import { parseArgs } from 'node:util';
import type { Book } from '../src/chess/book.ts';
import { encodeBook } from '../src/chess/bookFormat.ts';
import { moveFromUci } from '../src/chess/game.ts';
import { posKey } from '../src/chess/poskey.ts';
import type { ChapterData, NodeData, RepertoireData, Side } from '../src/chess/repertoireFormat.ts';
import { loadFullBook } from './lib/book.ts';
import { chapterIds, loadChapter } from './lib/content.ts';

const root = new URL('../', import.meta.url);
const { values } = parseArgs({
  options: {
    'no-book': { type: 'boolean', default: false },
    examples: { type: 'boolean', default: false },
    'skip-broken': { type: 'boolean', default: false },
  },
});

const contentDir = fileURLToPath(new URL('content/', root));
const full = values['no-book'] ? undefined : loadFullBook();

let loaded = chapterIds(contentDir)
  .filter(id => values.examples || !id.startsWith('_'))
  .map(id => ({ id, ...loadChapter(`${contentDir}${id}/`, id) }));
const broken = loaded.filter(entry => !entry.chapter);
for (const { id, issues } of broken) {
  const errors = issues.filter(issue => issue.level === 'error');
  if (values['skip-broken']) console.error(`skipped ${id}: ${errors.length} errors`);
  else for (const issue of errors) console.error(`${id}/${issue.where}: ${issue.message}`);
}
if (broken.length && !values['skip-broken']) {
  console.error('\nFix the errors above (pnpm content:check shows the warnings too).');
  process.exit(1);
}
loaded = loaded.filter(entry => entry.chapter);

const sideRank = (side: Side) => (side === 'white' ? 0 : 1);
loaded.sort((a, b) => sideRank(a.chapter!.side) - sideRank(b.chapter!.side) || a.order - b.order || a.id.localeCompare(b.id));
const data: RepertoireData = { chapters: loaded.map(entry => entry.chapter!) };

mkdirSync(new URL('public/', root), { recursive: true });
const json = JSON.stringify(data);
writeFileSync(new URL('public/repertoire.json', root), json);
for (const { id, stats } of loaded) {
  console.log(`${id.padEnd(28)} ${String(stats.lines).padStart(3)} lines ${String(stats.moves).padStart(6)} moves ${String(stats.words).padStart(7)} words`);
}
console.log(`wrote ${data.chapters.length} chapters, ${(json.length / 1024).toFixed(0)} kB -> public/repertoire.json`);

if (full) trimBook(full, data.chapters);
else if (!values['no-book']) console.log('data/book-full.bin is missing: public/book.bin was left as it is');

/** The moves every line of the chapter starts with. */
function commonPrefix(chapter: ChapterData): string[] {
  const mainline = (nodes: NodeData[]) => {
    const ucis: string[] = [];
    for (let node = nodes[0]; node; node = node.next?.[0]) ucis.push(node.uci);
    return ucis;
  };
  let prefix = mainline(chapter.lines[0]!.moves);
  for (const line of chapter.lines) {
    const moves = mainline(line.moves);
    let same = 0;
    while (same < prefix.length && moves[same] === prefix[same]) same++;
    prefix = prefix.slice(0, same);
  }
  return prefix;
}

function trimBook(book: Book, chapters: ChapterData[]): void {
  const keep = new Set<number>();
  for (const side of ['white', 'black'] as const) {
    // What the notes let this side play, by position.
    const noted = new Map<number, Set<number>>();
    const queue: Chess[] = [];
    for (const chapter of chapters.filter(candidate => candidate.side === side)) {
      const walk = (nodes: NodeData[], pos: Chess) => {
        for (const node of nodes) {
          const after = pos.clone();
          after.play(moveFromUci(node.uci));
          if (pos.turn === side) {
            const key = posKey(pos);
            if (!noted.has(key)) noted.set(key, new Set());
            noted.get(key)!.add(posKey(after));
          }
          if (node.next) walk(node.next, after);
        }
      };
      for (const line of chapter.lines) walk(line.moves, Chess.default());

      const pos = Chess.default();
      keep.add(posKey(pos));
      for (const uci of commonPrefix(chapter)) {
        pos.play(moveFromUci(uci));
        keep.add(posKey(pos));
      }
      queue.push(pos);
    }

    const seen = new Set<number>();
    while (queue.length) {
      const pos = queue.pop()!;
      const key = posKey(pos);
      if (seen.has(key)) continue;
      seen.add(key);
      const allowed = pos.turn === side ? noted.get(key) : undefined;
      for (const entry of book.moves(pos)) {
        const after = pos.clone();
        after.play(entry.move);
        const afterKey = posKey(after);
        if (allowed && !allowed.has(afterKey)) continue;
        keep.add(afterKey);
        if (!seen.has(afterKey)) queue.push(after);
      }
    }
  }

  const kept = [...keep].flatMap(key => {
    const stats = book.stats(key);
    return stats ? [{ key, stats }] : [];
  });
  kept.sort((a, b) => a.key - b.key);
  const bytes = encodeBook({
    games: book.games,
    minGames: book.minGames,
    keys: Float64Array.from(kept, entry => entry.key),
    white: Uint32Array.from(kept, entry => entry.stats.white),
    draws: Uint32Array.from(kept, entry => entry.stats.draws),
    black: Uint32Array.from(kept, entry => entry.stats.black),
  });
  writeFileSync(new URL('public/book.bin', root), bytes);
  console.log(
    `book: kept ${kept.length} of ${book.positions} positions, ${(bytes.length / 1048576).toFixed(1)} MB -> public/book.bin`,
  );
}
