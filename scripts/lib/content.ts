// Reads a chapter from content/<id>/ (chapter.md and its .pgn files), checks it and
// turns it into the compiled form the app loads. The format is described in
// content/README.md.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { Book } from '../../src/chess/book.ts';
import { uciOf } from '../../src/chess/game.ts';
import { posKey } from '../../src/chess/poskey.ts';
import {
  type ChapterData,
  isBad,
  type LineData,
  type NodeData,
  type SectionData,
  type Side,
  walkLine,
} from '../../src/chess/repertoireFormat.ts';
import { parsePgn, type PgnNode } from './pgn.ts';

export interface Issue {
  level: 'error' | 'warning';
  /** File and line, like "lines.pgn:120". */
  where: string;
  message: string;
}

export interface ChapterStats {
  lines: number;
  moves: number;
  positions: number;
  /** Positions where the chapter's side has a repertoire move to find. */
  drills: number;
  annotated: number;
  words: number;
}

export interface LoadedChapter {
  /** Missing when the chapter has errors that stop it from compiling. */
  chapter?: ChapterData;
  order: number;
  issues: Issue[];
  stats: ChapterStats;
}

/** A position needs this many book games before an unplayed move is worth a warning. */
const BOOK_MIN_GAMES = 40;

const SHAPE_COMMAND = /\[%(\w+)\s*([^\]]*)\]/g;
const ARROW = /^[GRYB][a-h][1-8][a-h][1-8]$/;
const SQUARE = /^[GRYB][a-h][1-8]$/;
const LINE_HEADERS = new Set(['Line', 'Section', 'Summary']);

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Tidies prose: paragraphs are separated by one blank line, a hard-wrapped
 * paragraph becomes one line, and "- " list items keep a line each.
 */
export function tidyText(raw: string): string {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) blocks.push(current.join('\n'));
    current = [];
  };
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/\s+/g, ' ');
    if (!line) flush();
    else if (line.startsWith('- ') || !current.length) current.push(line);
    else current[current.length - 1] += ' ' + line;
  }
  flush();
  return blocks.join('\n\n');
}

/** Splits a PGN comment into its text and its board marks. */
function readComment(comments: string[], where: string, issues: Issue[]): { text: string; shapes: string[] } {
  const shapes: string[] = [];
  const texts = comments.map(comment =>
    comment.replace(SHAPE_COMMAND, (_all, command: string, body: string) => {
      const items = body.split(',').map(item => item.trim()).filter(Boolean);
      if (command !== 'cal' && command !== 'csl') {
        issues.push({ level: 'error', where, message: `unknown command [%${command}]: only [%cal] and [%csl] exist` });
      } else {
        for (const item of items) {
          if ((command === 'cal' ? ARROW : SQUARE).test(item)) shapes.push(item);
          else {
            issues.push({
              level: 'error',
              where,
              message: `bad [%${command}] item "${item}": write ${command === 'cal' ? 'Ge2e4' : 'Ge4'} (colour G, R, Y or B)`,
            });
          }
        }
      }
      return ' ';
    }),
  );
  return { text: tidyText(texts.join('\n\n')), shapes: [...new Set(shapes)] };
}

function readShapes(arrows: string | undefined, squares: string | undefined, where: string, issues: Issue[]): string[] {
  const shapes: string[] = [];
  const add = (value: string | undefined, pattern: RegExp, example: string) => {
    for (const item of (value ?? '').split(/[\s,]+/).filter(Boolean)) {
      if (pattern.test(item)) shapes.push(item);
      else issues.push({ level: 'error', where, message: `bad mark "${item}": write it like ${example}` });
    }
  };
  add(arrows, ARROW, 'Ge2e4');
  add(squares, SQUARE, 'Ge4');
  return shapes;
}

const moveLabel = (ply: number, san: string) => `${(ply >> 1) + 1}${ply % 2 ? '...' : '.'} ${san}`;

/** "1. e4 e5 2. Nc3" from SAN moves played from the starting position. */
export function pgnOf(sans: readonly string[]): string {
  return sans.map((san, ply) => (ply % 2 ? san : `${(ply >> 1) + 1}. ${san}`)).join(' ');
}

interface Cursor {
  pos: Chess;
  sans: string[];
}

function convert(nodes: PgnNode[], at: Cursor, file: string, issues: Issue[]): NodeData[] {
  const ply = at.sans.length;
  const expected = `${(ply >> 1) + 1}${ply % 2 ? '...' : '.'}`;
  const out: NodeData[] = [];
  for (const raw of nodes) {
    const where = `${file}:${raw.line}`;
    const after = at.sans.length ? `after "${pgnOf(at.sans)}"` : 'from the starting position';
    if (raw.number && raw.number !== expected) {
      issues.push({
        level: 'error',
        where,
        message: `"${raw.number} ${raw.san}" is numbered wrongly: ${after} it is move ${expected}. A move was probably dropped or doubled.`,
      });
      continue;
    }
    if (!raw.number && ply % 2 === 0) {
      issues.push({
        level: 'error',
        where,
        message: `White's move ${raw.san} ${after} has no move number (${expected}). A move was probably dropped.`,
      });
      continue;
    }
    const move = parseSan(at.pos, raw.san);
    if (!move || !('from' in move)) {
      issues.push({
        level: 'error',
        where,
        message: `illegal move ${expected} ${raw.san} ${after} (position: ${makeFen(at.pos.toSetup())})`,
      });
      continue;
    }
    const san = makeSan(at.pos, move);
    if (san.replace(/[+#]/, '') === raw.san.replace(/[+#]/, '') && san !== raw.san) {
      issues.push({
        level: 'warning',
        where,
        message: `${moveLabel(ply, raw.san)} is written with the wrong check mark: it is ${san}. Is the position what you think it is?`,
      });
    }
    const { text, shapes } = readComment(raw.comments, where, issues);
    const node: NodeData = { uci: uciOf(at.pos, move), san };
    if (raw.glyph) node.glyph = raw.glyph;
    if (text) node.text = text;
    if (shapes.length) node.shapes = shapes;
    const pos = at.pos.clone();
    pos.play(move);
    const next = convert(raw.children, { pos, sans: [...at.sans, san] }, file, issues);
    if (next.length) node.next = next;
    out.push(node);
  }
  return out;
}

/** The moves of "1. e4 e5 2. Nc3" in UCI, or undefined (with an issue) when they cannot be played. */
function readMoveList(text: string, where: string, issues: Issue[]): string[] | undefined {
  const { games, problems } = parsePgn(`[Moves "list"]\n${text.replace(/\s+/g, ' ')} *`);
  const game = games[0];
  if (!game || problems.length) {
    issues.push({ level: 'error', where, message: `cannot read the moves: ${problems[0]?.message ?? 'empty'}` });
    return undefined;
  }
  const local: Issue[] = [];
  let nodes = convert(game.moves, { pos: Chess.default(), sans: [] }, where, local);
  if (local.length) {
    issues.push(...local.map(issue => ({ ...issue, where })));
    return undefined;
  }
  const ucis: string[] = [];
  while (nodes[0]) {
    ucis.push(nodes[0].uci);
    nodes = nodes[0].next ?? [];
  }
  return ucis;
}

interface Overview {
  meta: Map<string, string>;
  intro: string;
  sections: SectionData[];
}

function readOverview(text: string, issues: Issue[]): Overview {
  const file = 'chapter.md';
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const meta = new Map<string, string>();
  let i = 0;
  if (lines[0]?.trim() !== '---') {
    issues.push({ level: 'error', where: `${file}:1`, message: 'the file must start with a --- front matter block' });
  } else {
    for (i = 1; i < lines.length && lines[i]!.trim() !== '---'; i++) {
      const found = /^([a-z]+):\s*(.*)$/.exec(lines[i]!);
      if (found) meta.set(found[1]!, found[2]!.trim());
      else if (lines[i]!.trim()) {
        issues.push({ level: 'error', where: `${file}:${i + 1}`, message: 'front matter lines look like "key: value"' });
      }
    }
    i++;
  }

  const sections: SectionData[] = [];
  let intro = '';
  let title: string | undefined;
  let titleLine = 0;
  let body: string[] = [];
  const close = () => {
    if (title === undefined) {
      intro = tidyText(body.join('\n'));
    } else {
      const where = `${file}:${titleLine}`;
      const fields = new Map<string, string>();
      // Directives sit directly under the heading, before the prose.
      while (body.length) {
        const found = /^(moves|arrows|squares):\s*(.*)$/.exec(body[0]!.trim());
        if (found) fields.set(found[1]!, found[2]!);
        else if (body[0]!.trim()) break;
        body.shift();
      }
      const section: SectionData = { title, body: tidyText(body.join('\n')) };
      const moves = fields.has('moves') ? readMoveList(fields.get('moves')!, where, issues) : undefined;
      const shapes = readShapes(fields.get('arrows'), fields.get('squares'), where, issues);
      if (moves) section.moves = moves;
      if (shapes.length) {
        if (moves) section.shapes = shapes;
        else issues.push({ level: 'error', where, message: 'arrows and squares need a "moves:" line to draw on' });
      }
      if (!section.body) issues.push({ level: 'error', where, message: `section "${title}" has no text` });
      sections.push(section);
    }
    body = [];
  };
  for (; i < lines.length; i++) {
    const heading = /^##\s+(.*)$/.exec(lines[i]!);
    if (heading) {
      close();
      title = heading[1]!.trim();
      titleLine = i + 1;
    } else if (/^#/.test(lines[i]!)) {
      issues.push({ level: 'error', where: `${file}:${i + 1}`, message: 'only "## " headings are supported' });
    } else {
      body.push(lines[i]!);
    }
  }
  close();
  return { meta, intro, sections };
}

/** Loads and checks one chapter folder. With a book, repertoire moves are also compared with elite play. */
export function loadChapter(dir: string, id: string, book?: Book): LoadedChapter {
  const issues: Issue[] = [];
  const stats: ChapterStats = { lines: 0, moves: 0, positions: 0, drills: 0, annotated: 0, words: 0 };
  const failed = (): LoadedChapter => ({ order: 0, issues, stats });

  const overviewFile = dir + 'chapter.md';
  const pgnFiles = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.pgn')).sort() : [];
  if (!existsSync(overviewFile)) issues.push({ level: 'error', where: 'chapter.md', message: 'the file is missing' });
  if (!pgnFiles.length) issues.push({ level: 'error', where: 'lines.pgn', message: 'the chapter has no .pgn file' });
  if (issues.length) return failed();

  const overview = readOverview(readFileSync(overviewFile, 'utf8'), issues);
  const meta = (key: string) => {
    const value = overview.meta.get(key);
    if (!value) issues.push({ level: 'error', where: 'chapter.md:1', message: `front matter needs "${key}:"` });
    return value ?? '';
  };
  const title = meta('title');
  const subtitle = meta('subtitle');
  const group = meta('group');
  const side = meta('side');
  const order = Number(meta('order'));
  if (side !== 'white' && side !== 'black') {
    issues.push({ level: 'error', where: 'chapter.md:1', message: 'side must be "white" or "black"' });
    return failed();
  }
  if (!overview.intro) issues.push({ level: 'error', where: 'chapter.md', message: 'there is no introduction before the first ## section' });
  if (!overview.sections.some(section => /^sources$/i.test(section.title))) {
    issues.push({ level: 'error', where: 'chapter.md', message: 'there is no "## Sources" section' });
  }
  stats.words += wordCount(overview.intro) + overview.sections.reduce((sum, s) => sum + wordCount(s.body), 0);

  const games = pgnFiles.flatMap(file => {
    const parsed = parsePgn(readFileSync(dir + file, 'utf8'));
    for (const problem of parsed.problems) {
      issues.push({ level: 'error', where: `${file}:${problem.line}`, message: problem.message });
    }
    return parsed.games.map(game => ({ ...game, file }));
  });

  const lines: LineData[] = [];
  const names = new Set<string>();
  for (const game of games) {
    const where = `${game.file}:${game.line}`;
    for (const key of game.headers.keys()) {
      if (!LINE_HEADERS.has(key)) {
        issues.push({ level: 'error', where, message: `unknown header [${key}]: use Line, Section and Summary` });
      }
    }
    const name = game.headers.get('Line') ?? '';
    if (!name) issues.push({ level: 'error', where, message: 'the game has no [Line "..."] header' });
    if (names.has(name)) issues.push({ level: 'error', where, message: `two lines are called "${name}"` });
    names.add(name);
    const summary = game.headers.get('Summary') ?? '';
    if (!summary) issues.push({ level: 'error', where, message: `line "${name}" has no [Summary "..."] header` });
    const moves = convert(game.moves, { pos: Chess.default(), sans: [] }, game.file, issues);
    if (moves.length) lines.push({ name, section: game.headers.get('Section') ?? '', summary, moves });
    stats.words += wordCount(summary);
  }
  if (!lines.length) issues.push({ level: 'error', where: pgnFiles[0]!, message: 'there are no lines' });

  // Notes on the same move in different lines, and what elite players do.
  const notes = new Map<string, { text: string; line: string }>();
  const positions = new Set<number>();
  const drills = new Set<number>();
  for (const line of lines) {
    stats.lines++;
    let pos = Chess.default();
    let trail: Chess[] = [pos];
    walkLine(line, side as Side, ({ node, path, kind, mine }) => {
      const ply = path.length - 1;
      const before = trail[ply]!;
      const beforeKey = posKey(before);
      pos = before.clone();
      pos.play(parseSan(before, node.san)!);
      trail = [...trail.slice(0, ply + 1), pos];
      const key = posKey(pos);
      const label = moveLabel(ply, node.san + (node.glyph ?? ''));
      const where = `line "${line.name}"`;
      const warn = (message: string) => issues.push({ level: 'warning', where, message: `${label}: ${message}` });

      stats.moves++;
      positions.add(key);
      if (kind === 'repertoire') drills.add(beforeKey);
      if (node.text) {
        stats.annotated++;
        stats.words += wordCount(node.text);
        const edge = `${beforeKey}:${node.uci}`;
        const earlier = notes.get(edge);
        if (!earlier) notes.set(edge, { text: node.text, line: line.name });
        else if (earlier.text !== node.text) {
          warn(`already annotated in "${earlier.line}" with different text. Annotate a shared move once, in the first line it appears in.`);
        }
      }
      const explained = node.text || notes.has(`${beforeKey}:${node.uci}`);
      if (!explained) {
        if (node.glyph) warn(`has a ${node.glyph} but no comment saying why`);
        else if (mine && kind === 'alternative') warn('is an alternative to the repertoire move with no comment: say when or why one would play it');
      }
      if (kind === 'mistake' && !node.next && node.glyph !== '?!') warn('is marked as a mistake but no refutation follows');

      if (book && (kind === 'repertoire' || kind === 'alternative') && !isBad(node.glyph)) {
        const games = book.stats(beforeKey)?.total ?? 0;
        if (games >= BOOK_MIN_GAMES && !book.stats(key)) {
          const played = book.moves(before).slice(0, 4).map(entry => `${entry.san} ${Math.round(entry.share * 100)}%`);
          warn(
            `none of the ${games} elite games from this position continue with it (they play ${played.join(', ')}). ` +
              'Check the move against your source; keep it only if the source really gives it.',
          );
        }
      }
    });
  }
  stats.positions = positions.size;
  stats.drills = drills.size;

  if (issues.some(issue => issue.level === 'error')) return { order, issues, stats };
  return {
    chapter: { id, title, subtitle, side: side as Side, group, intro: overview.intro, sections: overview.sections, lines },
    order,
    issues,
    stats,
  };
}

/** Folder names under content/ that hold a chapter. */
export function chapterIds(contentDir: string): string[] {
  return readdirSync(contentDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(`${contentDir}${entry.name}/chapter.md`))
    .map(entry => entry.name)
    .sort();
}
