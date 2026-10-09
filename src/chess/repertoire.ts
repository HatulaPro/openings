import { Chess } from 'chessops/chess';
import { type Color, moveFromUci } from './game.ts';
import { posKey } from './poskey.ts';
import {
  type ChapterData,
  type Glyph,
  isBad,
  type LineData,
  type MoveKind,
  type RepertoireData,
  walkLine,
} from './repertoireFormat.ts';

export interface Line extends LineData {
  chapter: number;
  index: number;
  /** The main line in UCI. */
  main: string[];
  /** How many of the main line's first moves an earlier line of the chapter already plays. */
  shared: number;
}

export interface Chapter extends Omit<ChapterData, 'lines'> {
  index: number;
  lines: Line[];
  /** How many moves every line of the chapter starts with. */
  root: number;
}

/** One place in the notes where a move is written down. */
interface Occurrence {
  chapter: number;
  line: number;
  kind: MoveKind;
  /** The position after the move is one the repertoire can reach, so play goes on from it. */
  live: boolean;
  glyph?: Glyph;
  text?: string;
  shapes?: string[];
}

/** A move the notes mention, from one position to another. */
export interface RepMove {
  from: number;
  to: number;
  uci: string;
  san: string;
  occurrences: Occurrence[];
}

export interface RepPosition {
  /** Moves the notes give from here, in the order they first appear. */
  moves: RepMove[];
  /** Moves the notes give that lead here. */
  arrivals: RepMove[];
}

/** What the notes say about a move, seen from one chapter or from all of them. */
export interface MoveView {
  kind: MoveKind;
  glyph?: Glyph;
  text?: string;
  shapes?: string[];
  chapter: number;
  line: number;
}

export interface Puzzle {
  /** Key of the position to find a move in. */
  key: number;
  /** Moves from the starting position to it. */
  path: string[];
  /** The repertoire moves; more than one when lines of the chapter part ways here. */
  answers: RepMove[];
  line: number;
}

const KIND_RANK: Record<MoveKind, number> = { repertoire: 0, alternative: 1, reply: 2, mistake: 3, shown: 4 };

/**
 * The notes as a graph of positions, one per side, so that a position is
 * recognised however it was reached.
 */
export class Repertoire {
  readonly chapters: Chapter[];
  private readonly graphs: Record<Color, Map<number, RepPosition>> = { white: new Map(), black: new Map() };

  constructor(data: RepertoireData) {
    this.chapters = data.chapters.map((chapter, index) => {
      const lines = this.addLines(chapter, index);
      const first = lines[0]?.main ?? [];
      let root = first.length;
      for (const line of lines) {
        let same = 0;
        while (same < root && line.main[same] === first[same]) same++;
        root = same;
      }
      return { ...chapter, index, lines, root };
    });
  }

  private addLines(chapter: ChapterData, chapterIndex: number): Line[] {
    const graph = this.graphs[chapter.side];
    const position = (key: number) => {
      let found = graph.get(key);
      if (!found) graph.set(key, (found = { moves: [], arrivals: [] }));
      return found;
    };
    const start = Chess.default();
    const startKey = posKey(start);
    /** Moves earlier lines of this chapter already play, as "from:uci". */
    const played = new Set<string>();

    return chapter.lines.map((line, index) => {
      const main: string[] = [];
      for (let node = line.moves[0]; node; node = node.next?.[0]) main.push(node.uci);
      let shared = 0;
      {
        const pos = start.clone();
        while (shared < main.length && played.has(`${posKey(pos)}:${main[shared]}`)) {
          pos.play(moveFromUci(main[shared]!));
          shared++;
        }
      }

      const trail = [start];
      const keys = [startKey];
      walkLine(line, chapter.side, ({ node, path, kind, inRepertoire }) => {
        const ply = path.length - 1;
        const from = keys[ply]!;
        const after = trail[ply]!.clone();
        after.play(moveFromUci(node.uci));
        const to = posKey(after);
        trail.length = keys.length = ply + 1;
        trail.push(after);
        keys.push(to);
        played.add(`${from}:${node.uci}`);

        const origin = position(from);
        let move = origin.moves.find(candidate => candidate.uci === node.uci);
        if (!move) {
          move = { from, to, uci: node.uci, san: node.san, occurrences: [] };
          origin.moves.push(move);
          position(to).arrivals.push(move);
        }
        move.occurrences.push({
          chapter: chapterIndex,
          line: index,
          kind,
          live: inRepertoire,
          glyph: node.glyph,
          text: node.text,
          shapes: node.shapes,
        });
      });
      return { ...line, chapter: chapterIndex, index, main, shared };
    });
  }

  chapter(id: string): Chapter | undefined {
    return this.chapters.find(chapter => chapter.id === id);
  }

  /** What the given side's notes hold about a position, if anything. */
  at(side: Color, key: number): RepPosition | undefined {
    return this.graphs[side].get(key);
  }

  /** The move from one position, if the side's notes have it. */
  move(side: Color, from: number, uci: string): RepMove | undefined {
    return this.at(side, from)?.moves.find(move => move.uci === uci);
  }

  /**
   * The moves that keep a game inside a chapter's repertoire (or one line of
   * it): the repertoire moves when its side is to move, and every reply the
   * notes prepare for when the opponent is.
   */
  options(chapter: Chapter, key: number, line?: number): RepMove[] {
    const moves = this.at(chapter.side, key)?.moves ?? [];
    return moves.filter(move =>
      move.occurrences.some(
        occurrence => occurrence.live && occurrence.chapter === chapter.index && (line === undefined || occurrence.line === line),
      ),
    );
  }

  /**
   * Positions of a chapter (or one of its lines) where its side has a repertoire
   * move to find, in reading order. The moves every line of the chapter starts
   * with are what defines the chapter, so they are not asked.
   */
  puzzles(chapter: Chapter, lineIndex?: number): Puzzle[] {
    const puzzles = new Map<number, Puzzle>();
    const lines = lineIndex === undefined ? chapter.lines : chapter.lines.filter(line => line.index === lineIndex);
    for (const line of lines) {
      const keys = [posKey(Chess.default())];
      const trail = [Chess.default()];
      walkLine(line, chapter.side, ({ node, path, kind }) => {
        const ply = path.length - 1;
        const from = keys[ply]!;
        const after = trail[ply]!.clone();
        after.play(moveFromUci(node.uci));
        trail.length = keys.length = ply + 1;
        trail.push(after);
        keys.push(posKey(after));
        if (kind !== 'repertoire' || ply < chapter.root) return;
        let puzzle = puzzles.get(from);
        if (!puzzle) {
          puzzle = { key: from, path: path.slice(0, -1).map(step => step.uci), answers: [], line: line.index };
          puzzles.set(from, puzzle);
        }
        const move = this.move(chapter.side, from, node.uci)!;
        if (!puzzle.answers.includes(move)) puzzle.answers.push(move);
      });
    }
    return [...puzzles.values()];
  }
}

/**
 * Resolves what the notes say about a move. The same move can be written in
 * several lines and chapters, and can be the repertoire in one chapter and a
 * rejected alternative in another, so the given chapter's own view wins.
 */
export function viewOf(move: RepMove, chapter?: number): MoveView {
  const own = chapter === undefined ? [] : move.occurrences.filter(occurrence => occurrence.chapter === chapter);
  const pool = own.length ? own : move.occurrences;
  const best = pool.reduce((a, b) => (KIND_RANK[b.kind] < KIND_RANK[a.kind] ? b : a));
  const same = pool.filter(occurrence => occurrence.kind === best.kind);
  const pick = <K extends 'glyph' | 'text' | 'shapes'>(field: K) =>
    (same.find(occurrence => occurrence[field]) ?? pool.find(occurrence => occurrence[field]))?.[field];
  const glyph = pick('glyph');
  return {
    kind: best.kind !== 'repertoire' && isBad(glyph) ? 'mistake' : best.kind,
    glyph,
    text: pick('text'),
    shapes: pick('shapes'),
    chapter: best.chapter,
    line: best.line,
  };
}

/** Where reading a line starts: at the first move that earlier lines of the chapter do not already play. */
export function lineStart(chapter: Chapter, line: Line): number {
  return Math.min(line.main.length, Math.max(line.shared, chapter.root));
}

/** Sorts moves for display: the repertoire first, mistakes last, otherwise as the notes order them. */
export function rankMoves(moves: readonly RepMove[], chapter?: number): { move: RepMove; view: MoveView }[] {
  return moves
    .map((move, order) => ({ move, view: viewOf(move, chapter), order }))
    .sort((a, b) => KIND_RANK[a.view.kind] - KIND_RANK[b.view.kind] || a.order - b.order);
}

/** "5.Qf3 Nc6 6.Bb5" for the moves of a line's main line from a given ply on. */
export function linePgn(line: Line, fromPly = 0, maxMoves = 8): string {
  const parts: string[] = [];
  let node = line.moves[0];
  for (let ply = 0; node && parts.length < maxMoves; ply++, node = node.next?.[0]) {
    if (ply < fromPly) continue;
    const number = ply % 2 === 0 ? `${ply / 2 + 1}.` : parts.length ? '' : `${(ply + 1) / 2}...`;
    parts.push(`${number}${node.san}${node.glyph ?? ''}`);
  }
  return parts.join(' ');
}
