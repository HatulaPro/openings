// Finds and reads public Lichess studies, the main source for chapter research.
//
//   node scripts/study.ts search <words...>       studies matching the words, most liked first
//   node scripts/study.ts topic <topic name>      the most liked studies of a Lichess topic
//   node scripts/study.ts show <id>               a study's likes and its chapters
//   node scripts/study.ts chapter <id> <n> [n...]  the PGN of chapters, by their number in "show"
//
// A study's likes are how its trustworthiness is judged, so "search" and "show"
// print them. Chapters are printed without engine evaluations and clock times.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'https://lichess.org';
const cacheDir = join(tmpdir(), 'openings-studies');

async function get(url: string, accept: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'openings-trainer (personal study tool)' } });
    if (response.ok) return response.text();
    // Lichess asks clients that are told to slow down to wait a full minute.
    if (response.status === 429 && attempt < 2) await new Promise(resolve => setTimeout(resolve, 61_000));
    else throw new Error(`${url}: HTTP ${response.status}`);
  }
}

const decode = (html: string) =>
  html.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

interface Found {
  id: string;
  name: string;
  likes: number;
  owner: string;
}

/** Reads the study cards of a Lichess study list page. */
function readCards(html: string): Found[] {
  const found: Found[] = [];
  const card = /href="\/study\/([A-Za-z0-9]{8})"[^>]*title="([^"]*)"([\s\S]*?)(?=href="\/study\/[A-Za-z0-9]{8}"[^>]*title=|$)/g;
  for (const match of html.matchAll(card)) {
    const text = decode(match[3]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const meta = /(\d+) • ([^•]+) •/.exec(text);
    found.push({ id: match[1]!, name: decode(match[2]!), likes: meta ? Number(meta[1]) : -1, owner: meta ? meta[2]!.trim() : '?' });
  }
  return found;
}

/** Prints the studies of the first pages of a study list, most liked first. */
async function list(pageUrl: (page: number) => string): Promise<void> {
  const byId = new Map<string, Found>();
  for (const page of [1, 2, 3]) {
    const cards = readCards(await get(pageUrl(page), 'text/html'));
    for (const card of cards) byId.set(card.id, card);
    if (cards.length < 10) break;
  }
  const sorted = [...byId.values()].sort((a, b) => b.likes - a.likes);
  if (!sorted.length) console.log('no studies found');
  for (const study of sorted.slice(0, 25)) {
    console.log(`${String(study.likes).padStart(6)} likes  ${study.id}  ${study.name}  (by ${study.owner})`);
  }
}

const search = (words: string[]) =>
  list(page => `${SITE}/study/search?q=${encodeURIComponent(words.join(' '))}&page=${page}`);

/** Studies tagged with a Lichess topic, such as "King's Indian Defense". */
const topic = (words: string[]) =>
  list(page => `${SITE}/study/topic/${encodeURIComponent(words.join(' '))}/popular?page=${page}`);

async function pgnOf(id: string): Promise<string> {
  const file = join(cacheDir, `${id}.pgn`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const pgn = await get(`${SITE}/api/study/${id}.pgn?clocks=false&comments=true&variations=true&orientation=false`, 'application/x-chess-pgn');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, pgn);
  return pgn;
}

/** The study's chapters: each is one PGN game. */
function chaptersOf(pgn: string): string[] {
  return pgn.split(/\r?\n(?=\[Event ")/).map(game => game.trim()).filter(Boolean);
}

const header = (game: string, name: string) => new RegExp(`^\\[${name} "(.*)"\\]`, 'm').exec(game)?.[1];

async function show(id: string): Promise<void> {
  const chapters = chaptersOf(await pgnOf(id));
  const page = await get(`${SITE}/study/${id}`, 'text/html').catch(() => '');
  const likes = /"likes":(\d+)/.exec(page)?.[1] ?? 'unknown';
  console.log(`${header(chapters[0] ?? '', 'StudyName') ?? id}  ·  ${likes} likes  ·  ${SITE}/study/${id}`);
  chapters.forEach((game, i) => {
    const name = header(game, 'ChapterName') ?? header(game, 'Event') ?? '?';
    console.log(`${String(i + 1).padStart(3)}. ${name}  (${(game.length / 1000).toFixed(1)} kB)`);
  });
}

async function chapter(id: string, numbers: number[]): Promise<void> {
  const chapters = chaptersOf(await pgnOf(id));
  for (const n of numbers) {
    const game = chapters[n - 1];
    if (!game) throw new Error(`the study has chapters 1 to ${chapters.length}`);
    const blank = game.search(/\r?\n\r?\n/);
    const moves = game
      .slice(blank === -1 ? 0 : blank)
      .replace(/\[%(?:eval|clk|emt)[^\]]*\]/g, '')
      .replace(/\{\s*\}/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
    const tags = ['ChapterName', 'Event', 'FEN'].flatMap(tag => (header(game, tag) ? [`[${tag} "${header(game, tag)}"]`] : []));
    console.log(`${tags.join('\n')}\n\n${moves}\n`);
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'search' && rest.length) await search(rest);
else if (command === 'topic' && rest.length) await topic(rest);
else if (command === 'show' && rest[0]) await show(rest[0]);
else if (command === 'chapter' && rest.length > 1) await chapter(rest[0]!, rest.slice(1).map(Number));
else {
  console.log('usage: node scripts/study.ts search <words...> | topic <topic name> | show <id> | chapter <id> <n> [n...]');
  process.exit(1);
}
