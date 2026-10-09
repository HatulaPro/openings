// Checks chapters in content/ and prints what is wrong with them.
//
//   pnpm content:check [chapter-id ...]
//
// Errors (illegal moves, bad syntax, missing parts) stop a chapter from being
// built. Warnings point at notes that are missing or at repertoire moves that
// no elite game in the book plays, which usually means a mis-copied move.

import { fileURLToPath } from 'node:url';
import { loadFullBook } from './lib/book.ts';
import { chapterIds, loadChapter } from './lib/content.ts';

const contentDir = fileURLToPath(new URL('../content/', import.meta.url));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : chapterIds(contentDir);
if (!ids.length) throw new Error('no chapters in content/');

const book = loadFullBook();
if (!book) console.log('(data/book-full.bin is missing: moves are not compared with elite games)\n');

let errors = 0;
for (const id of ids) {
  const { issues, stats } = loadChapter(`${contentDir}${id.replace(/[\/]+$/, '')}/`, id, book);
  const bad = issues.filter(issue => issue.level === 'error');
  const warnings = issues.filter(issue => issue.level === 'warning');
  errors += bad.length;
  console.log(`== ${id}: ${bad.length} errors, ${warnings.length} warnings`);
  for (const issue of bad) console.log(`  ERROR    ${issue.where}: ${issue.message}`);
  for (const issue of warnings) console.log(`  warning  ${issue.where}: ${issue.message}`);
  console.log(
    `  ${stats.lines} lines, ${stats.moves} moves (${stats.annotated} annotated), ${stats.positions} positions, ` +
      `${stats.drills} positions to drill, ${stats.words} words\n`,
  );
}
process.exit(errors ? 1 : 0);
