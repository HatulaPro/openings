import { useCallback, useState } from 'react';

// Small pieces of state kept between sessions. Storage can be unavailable, in
// which case everything still works for the session.

function read<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not being remembered is the only consequence.
  }
}

/** A setting that is remembered, like whether the engine is on. */
export function usePref<T>(name: string, fallback: T): [T, (value: T) => void] {
  const key = `openings.pref.${name}`;
  const [value, setValue] = useState(() => read(key, fallback));
  const set = useCallback(
    (next: T) => {
      setValue(next);
      write(key, next);
    },
    [key],
  );
  return [value, set];
}

/** Where the last study session stopped. */
export interface Bookmark {
  chapter: string;
  line: number;
  path: string[];
  cursor: number;
}

const BOOKMARK_KEY = 'openings.bookmark';

export function loadBookmark(): Bookmark | undefined {
  const stored = read<Bookmark | null>(BOOKMARK_KEY, null);
  return stored && typeof stored.chapter === 'string' && Array.isArray(stored.path) ? stored : undefined;
}

export function saveBookmark(bookmark: Bookmark): void {
  write(BOOKMARK_KEY, bookmark);
}
