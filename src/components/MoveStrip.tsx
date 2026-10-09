import { useEffect, useRef } from 'react';

export interface StripMove {
  san: string;
  /** Marks a move that left the notes ('warn') or that the notes call a mistake ('bad'). */
  tone?: 'warn' | 'bad';
}

interface MoveStripProps {
  moves: StripMove[];
  /** How many moves have been played on the board; the last of them is highlighted. */
  cursor: number;
  onSelect: (cursor: number) => void;
}

/** The moves so far on one line that scrolls sideways and keeps the current move in view. */
export function MoveStrip({ moves, cursor, onSelect }: MoveStripProps) {
  const strip = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Centres the current move by hand: scrollIntoView would also shift the page.
    const box = strip.current;
    const el = current.current;
    if (box) box.scrollLeft = el ? el.offsetLeft - (box.clientWidth - el.clientWidth) / 2 : 0;
  }, [cursor, moves.length]);

  return (
    <div className="move-strip" ref={strip}>
      <button
        className={`move start${cursor === 0 ? ' selected' : ''}`}
        onClick={() => onSelect(0)}
        aria-label="Starting position"
      >
        Start
      </button>
      {moves.map((move, i) => (
        <span key={i} className={`strip-item${i >= cursor ? ' ahead' : ''}`}>
          {i % 2 === 0 && <span className="move-number">{i / 2 + 1}.</span>}
          <button
            ref={i === cursor - 1 ? current : undefined}
            className={['move', move.tone, i === cursor - 1 ? 'selected' : ''].filter(Boolean).join(' ')}
            onClick={() => onSelect(i + 1)}
          >
            {move.san}
          </button>
        </span>
      ))}
    </div>
  );
}
