import { type Analysis, describePv, formatEval, whiteShare } from '../engine';

interface EnginePanelProps {
  fen: string;
  /** Undefined while the engine is starting or has nothing yet. */
  analysis: Analysis | undefined;
  /** The position has no legal moves. */
  over: boolean;
  /** Show three lines instead of one. */
  wide: boolean;
  onWide: (wide: boolean) => void;
  /** Plays the first move of a line. */
  onPlay: (uci: string) => void;
}

/** Stockfish's verdict under the board: a bar, the evaluation and its best lines. */
export function EnginePanel({ fen, analysis, over, wide, onWide, onPlay }: EnginePanelProps) {
  const best = analysis?.lines[0];
  let status: string | undefined;
  if (over) status = 'The game is over here.';
  else if (analysis?.failed) status = 'The engine could not be started.';
  else if (!best) status = 'Stockfish is thinking…';

  return (
    <div className="engine">
      <div className="eval-bar" aria-hidden>
        <span style={{ width: `${(best ? whiteShare(best) : 0.5) * 100}%` }} />
      </div>
      {status ? (
        <p className="engine-status muted">{status}</p>
      ) : (
        analysis!.lines.slice(0, wide ? 3 : 1).map((line, i) => {
          const pv = describePv(fen, line.pv, wide ? 8 : 10);
          return (
            <button key={i} className="engine-line" onClick={() => pv.first && onPlay(pv.first)}>
              <span className={`eval ${line.cp >= 0 ? 'for-white' : 'for-black'}`}>{formatEval(line)}</span>
              <span className="pv">{pv.text}</span>
              {i === 0 && <span className="depth muted">d{analysis!.depth}</span>}
            </button>
          );
        })
      )}
      <button className="engine-more" onClick={() => onWide(!wide)} aria-label={wide ? 'Show one line' : 'Show three lines'}>
        {wide ? '1 line' : '3 lines'}
      </button>
    </div>
  );
}
