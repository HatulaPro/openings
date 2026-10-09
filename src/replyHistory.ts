import type { Tally } from './chess/replies';

const STORAGE_KEY = 'openings.replies';

/** Position key to the tally of replies the computer has played there. */
type History = Record<string, Record<string, number>>;

let cache: History | undefined;

function load(): History {
  if (cache) return cache;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    cache = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as History) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function tallyAt(key: number): Tally {
  return load()[key] ?? {};
}

export function recordReply(key: number, uci: string): void {
  const history = load();
  const tally = (history[key] ??= {});
  tally[uci] = (tally[uci] ?? 0) + 1;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Without storage the tally still lasts for this session.
  }
}
