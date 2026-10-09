export interface MoveListItem {
  san: string;
  /** Marks a move worth a second look. */
  tone?: 'warn' | 'bad';
}

interface MoveListProps {
  moves: MoveListItem[];
  selected?: number;
  onSelect?: (index: number) => void;
}

export function MoveList({ moves, selected, onSelect }: MoveListProps) {
  if (!moves.length) return <p className="muted move-list">No moves yet.</p>;

  const button = (i: number) => {
    const move = moves[i];
    if (!move) return null;
    return (
      <button
        className={['move', move.tone, i === selected ? 'selected' : ''].filter(Boolean).join(' ')}
        disabled={!onSelect}
        onClick={() => onSelect?.(i)}
      >
        {move.san}
      </button>
    );
  };

  // One cell per full move, so White's and Black's moves wrap together.
  const pairs = Array.from({ length: Math.ceil(moves.length / 2) }, (_, n) => n);
  return (
    <div className="move-list">
      {pairs.map(n => (
        <span key={n} className="move-pair">
          <span className="move-number">{n + 1}.</span>
          {button(n * 2)}
          {button(n * 2 + 1)}
        </span>
      ))}
    </div>
  );
}
