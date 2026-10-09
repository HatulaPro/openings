import type { BookMove } from './book';

/** The computer ignores moves rarer than this, so it does not wander into oddities. */
const MIN_REPLY_SHARE = 0.02;

/** How often the computer has already played each move from one position, by UCI. */
export type Tally = Readonly<Record<string, number>>;

/**
 * Picks the computer's reply from the book moves of a position.
 *
 * Each move's long-run frequency matches how often strong players choose it,
 * but the picks are spread out rather than independent: a move is weighted by
 * how far it is behind its fair share of the games played from this position
 * so far. A move that is ahead of its share cannot be picked until the others
 * catch up, which rules out long streaks of the main move.
 */
export function pickReply(moves: readonly BookMove[], tally: Tally, random: () => number = Math.random): BookMove {
  const usual = moves.filter(entry => entry.share >= MIN_REPLY_SHARE);
  const pool = usual.length ? usual : moves;
  const games = pool.reduce((sum, entry) => sum + entry.stats.total, 0);
  const played = pool.reduce((sum, entry) => sum + (tally[entry.uci] ?? 0), 0);

  // What each move is owed by the next game. The shortfalls always sum to at
  // least 1, so there is always something to pick.
  const owed = pool.map(entry =>
    Math.max(0, (entry.stats.total / games) * (played + 1) - (tally[entry.uci] ?? 0)),
  );
  let roll = random() * owed.reduce((sum, amount) => sum + amount, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= owed[i]!;
    if (roll < 0) return pool[i]!;
  }
  return pool[owed.indexOf(Math.max(...owed))]!;
}
