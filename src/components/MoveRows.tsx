import type { BookMove } from '../chess/book';
import { formatShare } from '../chess/game';
import type { MoveView } from '../chess/repertoire';
import { ResultBar } from './ResultBar';
import { teaser } from './RichText';

export interface MoveRow {
  uci: string;
  san: string;
  /** What the notes say about the move, when they mention it. */
  view?: MoveView;
  /** How elite players fare with it, when the book has it. */
  entry?: BookMove;
}

export function tagOf(view: MoveView | undefined): { label: string; tone: string } | undefined {
  switch (view?.kind) {
    case 'repertoire':
      return { label: 'Repertoire', tone: 'good' };
    case 'alternative':
      return { label: 'Alternative', tone: 'neutral' };
    case 'mistake':
      return view.glyph === '?!' ? { label: 'Dubious', tone: 'warn' } : { label: 'Mistake', tone: 'bad' };
    default:
      return undefined;
  }
}

interface MoveRowsProps {
  rows: MoveRow[];
  onPlay: (uci: string) => void;
}

/** The moves available from a position, each with the note's first words and its share of elite games. */
export function MoveRows({ rows, onPlay }: MoveRowsProps) {
  return (
    <ul className="move-rows">
      {rows.map(({ uci, san, view, entry }) => {
        const tag = tagOf(view);
        return (
          <li key={uci}>
            <button className={`move-row ${tag?.tone ?? ''}`} onClick={() => onPlay(uci)}>
              <span className="move-row-head">
                <span className="san">
                  {san}
                  {view?.glyph}
                </span>
                {tag && <span className={`tag ${tag.tone}`}>{tag.label}</span>}
                <span className="spacer" />
                {entry && (
                  <>
                    <span className="num muted">{formatShare(entry.share)}</span>
                    <ResultBar stats={entry.stats} />
                  </>
                )}
              </span>
              {view?.text && <span className="move-row-note">{teaser(view.text)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
