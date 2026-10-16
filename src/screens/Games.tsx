import { useEffect, useMemo, useState } from 'react';
import { type Color, moveNumber, trace } from '../chess/game';
import { checkGame } from '../chess/gameCheck';
import { placeOf, type Repertoire, viewOf } from '../chess/repertoire';
import { fetchGames, loadGames, type PlayedGame, type SavedGames, saveGames } from '../chesscom';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import type { Navigate } from '../routes';
import { usePref } from '../storage';

interface GamesProps {
  rep: Repertoire;
  navigate: Navigate;
  back: () => void;
}

/** Only the opening is compared with the notes. */
const CHECK_PLIES = 60;
/** A saved list older than this is fetched again when the screen opens. */
const STALE_MS = 10 * 60 * 1000;
/** A game counts as having followed the notes once this many of the user's moves were in them. */
const FOLLOWED_MOVES = 2;

type Tone = 'bad' | 'warn' | 'good' | 'neutral';

interface Checked {
  game: PlayedGame;
  tone: Tone;
  label: string;
  text: string;
  /** The move to open the review on. */
  ply?: number;
  /** Groups games that went wrong in the same way: the position and the move played there. */
  habit?: string;
}

const sideName = (color: Color) => (color === 'white' ? 'White' : 'Black');
const RESULTS = { win: 'Won', draw: 'Drew', loss: 'Lost' } as const;
const TAGS: Record<Tone, string> = { bad: 'Mistake', warn: 'Left notes', good: 'In notes', neutral: 'Not covered' };

function ago(seconds: number): string {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const orList = (items: string[]) => (items.length < 3 ? items.join(' or ') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`);

/** What a game shows about the repertoire: the first move worth a look, or how far the notes went. */
function verdict(rep: Repertoire, game: PlayedGame): Checked {
  const path = game.moves.slice(0, CHECK_PLIES);
  const { steps, keys } = trace(path);
  const { flags, exit } = checkGame(rep, game.side, undefined, path, keys);
  const ply = flags.findIndex(Boolean);
  const flag = flags[ply];
  const played = (at: number) => `${moveNumber(at)}${steps[at]!.san}`;

  if (flag) {
    const habit = `${keys[ply]}:${path[ply]}`;
    switch (flag.kind) {
      case 'mistake': {
        const glyph = viewOf(rep.move(game.side, keys[ply]!, path[ply]!)!).glyph ?? '';
        return { game, tone: 'bad', label: TAGS.bad, ply, habit, text: `${played(ply)}${glyph} is a mistake in your notes` };
      }
      case 'left': {
        const sans = flag.expected.map(move => {
          const place = placeOf(rep, move, true);
          return `${moveNumber(ply)}${move.san}${place ? ` (${place})` : ''}`;
        });
        return { game, tone: 'warn', label: TAGS.warn, ply, habit, text: `${played(ply)}, where your notes play ${orList(sans)}` };
      }
      case 'missed': {
        const best = flag.moves[0]!;
        return {
          game,
          tone: 'warn',
          label: 'Missed',
          ply,
          habit,
          text: `${played(ply)}, where ${moveNumber(ply)}${best.san} would reach ${placeOf(rep, best.aimed, true) ?? 'your notes'}`,
        };
      }
    }
  }

  const ownInNotes = path.filter((_, at) => at % 2 === (game.side === 'white' ? 0 : 1) && rep.move(game.side, keys[at]!, path[at]!)).length;
  if (!exit) return { game, tone: 'good', label: TAGS.good, text: 'Stayed in your notes as far as they go' };
  if (exit.mine) return { game, tone: 'neutral', label: TAGS.neutral, ply: exit.ply, text: `Left your notes with ${played(exit.ply)}` };
  if (ownInNotes < FOLLOWED_MOVES) {
    return { game, tone: 'neutral', label: TAGS.neutral, ply: exit.ply, text: `Your repertoire does not cover ${played(exit.ply)}` };
  }
  const arrived = exit.ply > 0 ? rep.move(game.side, keys[exit.ply - 1]!, path[exit.ply - 1]!) : undefined;
  const place = arrived && placeOf(rep, arrived, false);
  const chapter = place ? ` (${place})` : '';
  return { game, tone: 'good', label: TAGS.good, ply: exit.ply, text: `In your notes until the opponent played ${played(exit.ply)}${chapter}` };
}

/**
 * The user's recent chess.com games compared with the repertoire: where they
 * left it, where the notes call a move a mistake, and where a game outside the
 * notes could have been steered back into them. Moves played the same wrong way
 * in several games are listed first, as habits.
 */
export function Games({ rep, navigate, back }: GamesProps) {
  const [user, setUser] = usePref('chesscomUser', '');
  const [draft, setDraft] = useState(user);
  const [editing, setEditing] = useState(!user);
  const [saved, setSaved] = useState<SavedGames | undefined>(loadGames);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = usePref<'review' | 'all'>('gamesFilter', 'review');

  const load = (name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    fetchGames(name)
      .then(games => {
        const next = { user: name.trim(), fetched: Date.now(), games };
        saveGames(next);
        setSaved(next);
        setUser(name.trim());
        setEditing(false);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user && (!saved || saved.user !== user || Date.now() - saved.fetched > STALE_MS)) load(user);
  }, []);

  const shown = saved && !editing && saved.user.toLowerCase() === user.toLowerCase() ? saved : undefined;
  const checked = useMemo(() => shown?.games.map(game => verdict(rep, game)) ?? [], [shown, rep]);

  const habits = useMemo(() => {
    const groups = new Map<string, Checked[]>();
    for (const entry of checked) {
      if (!entry.habit) continue;
      const group = groups.get(entry.habit);
      if (group) group.push(entry);
      else groups.set(entry.habit, [entry]);
    }
    return [...groups.values()].filter(group => group.length > 1).sort((a, b) => b.length - a.length);
  }, [checked]);

  const toReview = checked.filter(entry => entry.tone === 'bad' || entry.tone === 'warn');
  const list = filter === 'review' ? toReview : checked;
  const counts = {
    mistake: checked.filter(entry => entry.tone === 'bad').length,
    left: checked.filter(entry => entry.label === TAGS.warn).length,
    missed: checked.filter(entry => entry.label === 'Missed').length,
  };

  const open = (entry: Checked) =>
    navigate({
      screen: 'study',
      side: entry.game.side,
      path: entry.game.moves,
      cursor: entry.ply === undefined ? undefined : entry.ply + 1,
      review: true,
      title: `vs ${entry.game.opponent}, ${entry.game.timeClass}`,
    });

  return (
    <Screen
      title="My games"
      subtitle={shown ? `chess.com: ${shown.user}, updated ${ago(shown.fetched / 1000)}` : 'Recent chess.com games against your notes'}
      onBack={back}
      scrollKey="games"
      footer={
        !editing && (
          <>
            <button className="btn" onClick={() => load(user)} disabled={loading}>
              {loading ? 'Fetching…' : 'Refresh'}
            </button>
            <button className="btn" onClick={() => setEditing(true)} disabled={loading}>
              Change player
            </button>
          </>
        )
      }
    >
      {editing && (
        <form
          className="panel games-user"
          onSubmit={event => {
            event.preventDefault();
            load(draft);
          }}
        >
          <h2>chess.com username</h2>
          <input
            className="field"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Username"
            aria-label="chess.com username"
          />
          <div className="actions">
            {user && (
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn primary" disabled={loading || !draft.trim()}>
              {loading ? 'Fetching…' : 'Load games'}
            </button>
          </div>
          <p className="muted">The games are read from chess.com’s public archive; no sign-in is needed.</p>
        </form>
      )}

      {error && <p className="pad games-error">{error}</p>}
      {loading && !shown && !editing && <p className="status">Fetching games from chess.com…</p>}

      {shown && (
        <>
          <p className="pad muted">
            {checked.length === 0
              ? 'No standard games in the last three months.'
              : `Your last ${checked.length} games: ${
                  [
                    counts.left && `${counts.left} left your notes`,
                    counts.missed && `${counts.missed} missed a way back into them`,
                    counts.mistake && `${counts.mistake} had a move your notes call a mistake`,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'all stayed with your notes as far as they go'
                }.`}
          </p>

          {habits.length > 0 && (
            <section>
              <h2>Habits</h2>
              <ul className="list">
                {habits.map(group => {
                  const first = group[0]!;
                  return (
                    <li key={first.habit}>
                      <button className="row" onClick={() => open(first)}>
                        <span className="row-main">
                          <span className={`row-title ${first.tone}`}>{first.text}</span>
                          <span className="row-sub">
                            As {sideName(first.game.side)}, in {group.length} games
                          </span>
                        </span>
                        <span className="row-side">›</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {checked.length > 0 && (
            <section>
              <h2>Games</h2>
              <div className="pad games-filter">
                <Segmented
                  label="Which games"
                  value={filter}
                  options={[
                    { value: 'review', label: `To review (${toReview.length})` },
                    { value: 'all', label: `All (${checked.length})` },
                  ]}
                  onChange={setFilter}
                />
              </div>
              {list.length === 0 && <p className="pad muted">Every game stayed with your notes as long as they cover it.</p>}
              <ul className="list">
                {list.map(entry => (
                  <li key={entry.game.url}>
                    <button className="row" onClick={() => open(entry)}>
                      <span className="row-main">
                        <span className="row-title">
                          vs {entry.game.opponent} <span className="muted">({entry.game.opponentRating})</span>
                        </span>
                        <span className="row-sub">
                          {RESULTS[entry.game.result]} as {sideName(entry.game.side)} · {entry.game.timeClass} · {ago(entry.game.end)}
                        </span>
                        <span className={`row-note ${entry.tone}`}>{entry.text}</span>
                      </span>
                      <span className={`tag ${entry.tone}`}>{entry.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Screen>
  );
}
