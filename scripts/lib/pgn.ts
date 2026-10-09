// A strict reader for the annotated PGN in content/. Unlike a tolerant PGN
// parser it rejects anything it does not understand, with the line it is on:
// a silently skipped token would shift every later move.

import type { Glyph } from '../../src/chess/repertoireFormat.ts';

export interface PgnNode {
  /** The move as written, without check marks' glyphs: "Nxe4", "O-O", "exd8=Q+". */
  san: string;
  glyph?: Glyph;
  /** The move number written before the move, like "5." or "5...", if any. */
  number?: string;
  comments: string[];
  /** 1-based line of the file the move is on. */
  line: number;
  /** Continuations; the first is the main one. */
  children: PgnNode[];
}

export interface PgnGame {
  headers: Map<string, string>;
  line: number;
  /** First moves of the game: the main one and any alternatives to it. */
  moves: PgnNode[];
}

export interface PgnProblem {
  line: number;
  message: string;
}

const HEADER = /^\[([A-Za-z][A-Za-z0-9_]*)[ \t]+"((?:[^"\\]|\\.)*)"\][ \t]*$/;
const RESULT = /(?:\*|1-0|0-1|1\/2-1\/2)(?=[\s)]|$)/y;
const NUMBER = /(\d+)[ \t]*(\.\.\.|\.)/y;
const NAG = /\$(\d+)/y;
const GLYPH = /(?:!!|\?\?|!\?|\?!|!|\?)(?=[\s){]|$)/y;
const SAN =
  /((?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?)(!!|\?\?|!\?|\?!|!|\?)?(?=[\s){(]|$)/y;
const NAG_GLYPHS: Record<number, Glyph> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };

interface Frame {
  /** Where the next move of this variation attaches. */
  siblings: PgnNode[];
  /** The last move of this variation, and the list it was added to. */
  last?: PgnNode;
  lastSiblings?: PgnNode[];
  /** Comments written before the variation's first move. */
  pending: string[];
  number?: string;
}

/** Reads every game of a PGN file. A game with a problem is dropped and reported. */
export function parsePgn(text: string): { games: PgnGame[]; problems: PgnProblem[] } {
  const games: PgnGame[] = [];
  const problems: PgnProblem[] = [];
  let at = 0;
  let line = 1;

  const advance = (to: number) => {
    for (let i = at; i < to; i++) if (text.charCodeAt(i) === 10) line++;
    at = to;
  };
  const skipSpace = () => {
    let i = at;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    advance(i);
  };
  const endOfLine = () => {
    const i = text.indexOf('\n', at);
    return i === -1 ? text.length : i;
  };
  const atLineStart = () => at === 0 || text[at - 1] === '\n';
  const match = (regex: RegExp) => {
    regex.lastIndex = at;
    return regex.exec(text);
  };
  /** Moves past the rest of a broken game, to the next line that starts a header. */
  const skipGame = () => {
    for (;;) {
      advance(Math.min(text.length, endOfLine() + 1));
      if (at >= text.length || HEADER.test(text.slice(at, endOfLine()).replace(/\r$/, ''))) return;
    }
  };

  for (;;) {
    skipSpace();
    if (at >= text.length) break;
    const game: PgnGame = { headers: new Map(), line, moves: [] };

    // Headers.
    let ok = true;
    while (at < text.length && text[at] === '[') {
      const raw = text.slice(at, endOfLine()).replace(/\r$/, '');
      const header = HEADER.exec(raw);
      if (!header || !atLineStart()) {
        problems.push({ line, message: `not a header line: ${raw.slice(0, 60)}` });
        ok = false;
        break;
      }
      game.headers.set(header[1]!, header[2]!.replace(/\\(.)/g, '$1'));
      advance(endOfLine());
      skipSpace();
    }
    if (!ok) {
      skipGame();
      continue;
    }
    if (!game.headers.size) {
      problems.push({ line, message: 'a game must start with its headers, like [Line "..."]' });
      skipGame();
      continue;
    }

    // Movetext.
    const stack: Frame[] = [{ siblings: game.moves, pending: [] }];
    const fail = (message: string) => {
      problems.push({ line, message });
      ok = false;
    };
    let finished = false;
    while (ok && !finished) {
      skipSpace();
      const frame = stack[stack.length - 1]!;
      if (at >= text.length || (text[at] === '[' && atLineStart())) {
        fail('the game does not end with *');
        break;
      }
      const char = text[at]!;
      if (char === '{') {
        const close = text.indexOf('}', at);
        if (close === -1) {
          fail('comment is never closed with }');
          break;
        }
        const comment = text.slice(at + 1, close);
        if (comment.includes('{')) {
          fail('a { inside a comment: comments cannot nest');
          break;
        }
        (frame.last ? frame.last.comments : frame.pending).push(comment);
        advance(close + 1);
      } else if (char === '(') {
        if (!frame.last || !frame.lastSiblings) {
          fail('a variation must come after the move it replaces');
          break;
        }
        stack.push({ siblings: frame.lastSiblings, pending: [] });
        advance(at + 1);
      } else if (char === ')') {
        if (stack.length === 1) {
          fail('a ) without a matching (');
          break;
        }
        if (!frame.last) {
          fail('an empty variation');
          break;
        }
        stack.pop();
        advance(at + 1);
      } else if (match(RESULT)) {
        if (stack.length > 1) fail('the game ends inside a variation: a ) is missing');
        advance(RESULT.lastIndex);
        finished = true;
      } else if (match(NUMBER)) {
        const found = match(NUMBER)!;
        frame.number = found[1]! + found[2]!;
        advance(NUMBER.lastIndex);
      } else if (match(NAG) || match(GLYPH)) {
        const nag = match(NAG);
        const glyph = nag ? NAG_GLYPHS[Number(nag[1])] : (match(GLYPH)![0] as Glyph);
        if (!frame.last) {
          fail('an annotation with no move before it');
          break;
        }
        if (glyph) frame.last.glyph = glyph;
        advance(nag ? NAG.lastIndex : GLYPH.lastIndex);
      } else {
        const found = match(SAN);
        if (!found) {
          const word = text.slice(at, at + 24).split(/\s/)[0];
          fail(`cannot read "${word}" as a move`);
          break;
        }
        const node: PgnNode = {
          san: found[1]!.replace(/0/g, 'O'),
          glyph: found[2] as Glyph | undefined,
          number: frame.number,
          comments: frame.pending,
          line,
          children: [],
        };
        frame.siblings.push(node);
        frame.lastSiblings = frame.siblings;
        frame.last = node;
        frame.siblings = node.children;
        frame.pending = [];
        frame.number = undefined;
        advance(SAN.lastIndex);
      }
    }
    if (ok && !game.moves.length) fail('the game has no moves');
    if (ok) games.push(game);
    else skipGame();
  }
  return { games, problems };
}
