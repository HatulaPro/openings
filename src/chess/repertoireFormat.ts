// The compiled repertoire: public/repertoire.json, written by
// scripts/build-repertoire.ts from the chapters in content/ and fetched by the app.
// This file has no imports, so the build scripts can load it under Node as is.

export type Side = 'white' | 'black';

export type Glyph = '!' | '?' | '!!' | '??' | '!?' | '?!';

export interface RepertoireData {
  chapters: ChapterData[];
}

export interface ChapterData {
  /** Folder name under content/. */
  id: string;
  title: string;
  /** The moves that define the chapter, like "1.e4 e5 2.Nc3 Nf6 3.f4". */
  subtitle: string;
  /** The side the chapter is a repertoire for. */
  side: Side;
  /** Heading the chapter is listed under, like "Vienna Game". */
  group: string;
  intro: string;
  sections: SectionData[];
  lines: LineData[];
}

/** A part of the chapter overview: an idea, a plan or a structure, usually with a diagram. */
export interface SectionData {
  title: string;
  body: string;
  /** Moves in UCI from the starting position to the diagram, when the section has one. */
  moves?: string[];
  shapes?: string[];
}

export interface LineData {
  name: string;
  /** Heading the line is listed under within the chapter. */
  section: string;
  summary: string;
  /** First moves from the starting position; the first entry is the line's own. */
  moves: NodeData[];
}

export interface NodeData {
  /** Castling is written king-takes-rook, as everywhere in the app. */
  uci: string;
  san: string;
  glyph?: Glyph;
  /** Why the move is played and what matters in the position after it. Paragraphs are separated by a blank line. */
  text?: string;
  /** Board marks: "Gd2d4" is a green arrow, "Rd5" a red square. Colours are G, R, Y and B. */
  shapes?: string[];
  /** Continuations; the first is the main one, the rest are alternatives to it. */
  next?: NodeData[];
}

/** How a move relates to the repertoire of the chapter it is written in. */
export type MoveKind =
  /** The move to play: the main continuation at one of the chapter side's own turns. */
  | 'repertoire'
  /** A playable second choice for the chapter's side. */
  | 'alternative'
  /** Something the opponent can play in a position the repertoire has to handle. */
  | 'reply'
  /** A move by either side that the notes mark as wrong or doubtful. */
  | 'mistake'
  /** A move that only illustrates a note, deep inside an alternative or a refutation. */
  | 'shown';

export interface Visit {
  node: NodeData;
  /** Moves from the starting position up to and including this one. */
  path: NodeData[];
  kind: MoveKind;
  /** The chapter's side plays this move. */
  mine: boolean;
  /** The position after the move is one the repertoire can reach by its own choices. */
  inRepertoire: boolean;
}

export const isBad = (glyph: Glyph | undefined): boolean => glyph === '?' || glyph === '??' || glyph === '?!';

/**
 * Visits every move of a line, parents before children and main moves first.
 *
 * At the chapter side's turns the first continuation is the repertoire move and
 * the others are alternatives or mistakes, whose subtrees only illustrate. At
 * the opponent's turns every continuation has to be answered, so all of them
 * stay inside the repertoire.
 */
export function walkLine(line: LineData, side: Side, visit: (at: Visit) => void): void {
  const descend = (nodes: NodeData[], path: NodeData[], inRepertoire: boolean) => {
    const mine = (path.length % 2 === 0 ? 'white' : 'black') === side;
    nodes.forEach((node, index) => {
      const repertoire = mine && inRepertoire && index === 0;
      let kind: MoveKind;
      if (repertoire) kind = 'repertoire';
      else if (isBad(node.glyph)) kind = 'mistake';
      else if (!inRepertoire) kind = 'shown';
      else kind = mine ? 'alternative' : 'reply';
      const stays = mine ? repertoire : inRepertoire;
      const here = [...path, node];
      visit({ node, path: here, kind, mine, inRepertoire: stays });
      if (node.next) descend(node.next, here, stays);
    });
  };
  descend(line.moves, [], true);
}
