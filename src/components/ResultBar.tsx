import type { Stats } from '../chess/book';

/** White wins, draws and black wins as one proportional bar. */
export function ResultBar({ stats }: { stats: Stats }) {
  const percent = (n: number) => (n / stats.total) * 100;
  const segment = (className: string, n: number) => (
    <span className={className} style={{ width: `${percent(n)}%` }}>
      {percent(n) >= 18 ? `${Math.round(percent(n))}%` : ''}
    </span>
  );
  return (
    <div
      className="result-bar"
      aria-label={`White wins ${Math.round(percent(stats.white))}%, draws ${Math.round(
        percent(stats.draws),
      )}%, Black wins ${Math.round(percent(stats.black))}%`}
    >
      {segment('white', stats.white)}
      {segment('draw', stats.draws)}
      {segment('black', stats.black)}
    </div>
  );
}
