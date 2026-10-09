import { levelOf, type Mastery, type Standing } from '../progress';

/** Left to right; what is left of the bar is untested. */
const SEGMENTS: Standing[] = ['solid', 'learning', 'fading', 'missed'];

const LEGEND: [Standing, string][] = [
  ['solid', 'solid'],
  ['learning', 'learning'],
  ['fading', 'to refresh'],
  ['missed', 'missed'],
  ['untested', 'untested'],
];

/** The positions of a chapter or line as one bar: how many are solid, fading or missed, and how many were never asked. */
export function MasteryBar({ mastery, edge }: { mastery: Mastery; edge?: boolean }) {
  return (
    <div className={edge ? 'mastery-bar edge' : 'mastery-bar'} aria-hidden>
      {SEGMENTS.map(
        standing =>
          mastery[standing] > 0 && (
            <span key={standing} className={standing} style={{ width: `${(mastery[standing] / Math.max(1, mastery.total)) * 100}%` }} />
          ),
      )}
    </div>
  );
}

/** "Shaky · 3 missed · 5 to refresh · 40 of 120 untested": the level, then what there is to work on. */
export function MasteryNote({ mastery }: { mastery: Mastery }) {
  const level = levelOf(mastery);
  const parts: string[] = [];
  if (mastery.untested < mastery.total) {
    if (mastery.missed) parts.push(`${mastery.missed} missed`);
    if (mastery.fading) parts.push(`${mastery.fading} to refresh`);
    if (mastery.untested) parts.push(`${mastery.untested} of ${mastery.total} untested`);
    if (!parts.length && mastery.learning) parts.push(`${mastery.learning} to confirm`);
  }
  return (
    <span className="mastery-note">
      <span className={`level ${level.tone}`}>{level.label}</span>
      {parts.map(part => ` · ${part}`)}
    </span>
  );
}

/** The bar's colours spelled out with their counts. */
export function MasteryLegend({ mastery }: { mastery: Mastery }) {
  return (
    <p className="mastery-legend">
      {LEGEND.map(
        ([standing, label]) =>
          mastery[standing] > 0 && (
            <span key={standing} className={`key ${standing}`}>
              {mastery[standing]} {label}
            </span>
          ),
      )}
    </p>
  );
}
