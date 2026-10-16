import type { Chapter, Line, Repertoire } from '../chess/repertoire';
import { colourOfLine } from '../lineColour';

/** The colour a line is remembered by: before its name in a list, or beside "White to move" while drilling. */
export function LineDot({ rep, chapter, line }: { rep: Repertoire; chapter: Chapter; line: Line | number }) {
  const name = chapter.lines[typeof line === 'number' ? line : line.index]?.name;
  return (
    <span className="line-dot" style={{ background: colourOfLine(rep, chapter, line) }} role="img" aria-label={`Line: ${name}`} />
  );
}
