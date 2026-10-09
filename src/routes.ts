import { useCallback, useEffect, useState } from 'react';
import type { Color } from './chess/game';

export type Route =
  | { screen: 'home' }
  | { screen: 'chapter'; id: string }
  | {
      screen: 'study';
      /** Whose notes are shown, and the side at the bottom of the board. */
      side: Color;
      chapter?: string;
      line?: number;
      path: string[];
      /** How many moves of the path are on the board; all of them when left out. */
      cursor?: number;
      /** The path is a game just played against the book. */
      review?: boolean;
    }
  | { screen: 'train'; chapter: string; line?: number }
  | { screen: 'play'; chapter: string; line?: number };

export type Navigate = (route: Route, options?: { replace?: boolean }) => void;

interface Entry {
  route: Route;
  /** Distinguishes visits, so a screen starts afresh each time it is navigated to. */
  visit: number;
}

const HOME: Entry = { route: { screen: 'home' }, visit: 0 };
let visits = 0;

function current(): Entry {
  return (history.state as Entry | null)?.route ? (history.state as Entry) : HOME;
}

/**
 * Screens live in the browser history, so the Android back button walks back
 * through them (see main.tsx).
 */
export function useRoute(): { route: Route; visit: number; navigate: Navigate; back: () => void } {
  const [entry, setEntry] = useState(current);

  useEffect(() => {
    const onPop = () => setEntry(current());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback<Navigate>((route, options) => {
    const next: Entry = { route, visit: Date.now() + ++visits };
    if (options?.replace) history.replaceState(next, '');
    else history.pushState(next, '');
    setEntry(next);
  }, []);
  const back = useCallback(() => history.back(), []);

  return { route: entry.route, visit: entry.visit, navigate, back };
}
