import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { type Color, uciOf } from './chess/game.ts';

// Recent games from chess.com's public API, kept in storage so the list still
// shows without a connection.

export interface PlayedGame {
  url: string;
  /** The colour the user had. */
  side: Color;
  opponent: string;
  opponentRating: number;
  rating: number;
  result: 'win' | 'draw' | 'loss';
  /** "bullet", "blitz", "rapid" or "daily". */
  timeClass: string;
  /** Seconds since 1970. */
  end: number;
  /** The moves in UCI, castling written king-takes-rook. */
  moves: string[];
}

export interface SavedGames {
  user: string;
  fetched: number;
  games: PlayedGame[];
}

/** How many of the most recent games are fetched. */
export const GAME_COUNT = 60;
/** Monthly archives looked through for them, newest first. */
const MAX_ARCHIVES = 3;
const STORAGE_KEY = 'openings.games';

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

interface ApiPlayer {
  username: string;
  rating: number;
  result: string;
}

interface ApiGame {
  url: string;
  pgn?: string;
  rules: string;
  time_class: string;
  end_time: number;
  initial_setup?: string;
  white: ApiPlayer;
  black: ApiPlayer;
}

const STANDARD_SETUP = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The main line of a PGN in UCI, or undefined if it does not start from the usual position. */
export function movesOfPgn(pgn: string): string[] | undefined {
  const game = parsePgn(pgn)[0];
  if (!game) return undefined;
  const start = startingPosition(game.headers);
  if (start.isErr) return undefined;
  const pos = start.value;
  if (pos.fullmoves !== 1 || pos.turn !== 'white') return undefined;
  const moves: string[] = [];
  for (const node of game.moves.mainline()) {
    const move = parseSan(pos, node.san);
    if (!move || !isNormal(move)) break;
    moves.push(uciOf(pos, move));
    pos.play(move);
  }
  return moves;
}

function toGame(api: ApiGame, user: string): PlayedGame | undefined {
  if (api.rules !== 'chess' || !api.pgn) return undefined;
  if (api.initial_setup && api.initial_setup !== STANDARD_SETUP) return undefined;
  const side: Color = api.white.username.toLowerCase() === user ? 'white' : 'black';
  const me = api[side];
  const them = api[side === 'white' ? 'black' : 'white'];
  const moves = movesOfPgn(api.pgn);
  // Games abandoned before a move or two say nothing about the opening.
  if (!moves || moves.length < 4) return undefined;
  return {
    url: api.url,
    side,
    opponent: them.username,
    opponentRating: them.rating,
    rating: me.rating,
    result: me.result === 'win' ? 'win' : DRAWS.has(me.result) ? 'draw' : 'loss',
    timeClass: api.time_class,
    end: api.end_time,
    moves,
  };
}

async function getJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('chess.com could not be reached. Check the connection.');
  }
  if (response.status === 404) throw new Error('not found');
  if (!response.ok) throw new Error(`chess.com answered with HTTP ${response.status}.`);
  return (await response.json()) as T;
}

/** The user's most recent games, newest first. */
export async function fetchGames(username: string): Promise<PlayedGame[]> {
  const user = username.trim().toLowerCase();
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(user)}`;
  let archives: string[];
  try {
    archives = (await getJson<{ archives: string[] }>(`${base}/games/archives`)).archives;
  } catch (error) {
    if ((error as Error).message === 'not found') throw new Error(`chess.com has no player called “${username.trim()}”.`);
    throw error;
  }
  const games: PlayedGame[] = [];
  for (const archive of archives.slice(-MAX_ARCHIVES).reverse()) {
    const month = await getJson<{ games: ApiGame[] }>(archive);
    for (const api of month.games) {
      const game = toGame(api, user);
      if (game) games.push(game);
    }
    if (games.length >= GAME_COUNT) break;
  }
  return games.sort((a, b) => b.end - a.end).slice(0, GAME_COUNT);
}

export function loadGames(): SavedGames | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const saved = stored ? (JSON.parse(stored) as SavedGames) : undefined;
    return saved && Array.isArray(saved.games) ? saved : undefined;
  } catch {
    return undefined;
  }
}

export function saveGames(saved: SavedGames): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // The list is fetched again next time.
  }
}
