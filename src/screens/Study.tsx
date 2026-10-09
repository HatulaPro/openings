import { INITIAL_FEN } from 'chessops/fen';
import type { NormalMove } from 'chessops/types';
import { useEffect, useMemo, useState } from 'react';
import type { Book } from '../chess/book';
import { type Color, formatShare, moveNumber, positionAfter, trace, uciOf } from '../chess/game';
import { type Chapter, type Line, lineStart, type MoveView, rankMoves, type Repertoire, viewOf } from '../chess/repertoire';
import { shapesOf } from '../chess/shapes';
import { Board } from '../components/Board';
import { EnginePanel } from '../components/EnginePanel';
import { type MoveRow, MoveRows, tagOf } from '../components/MoveRows';
import { MoveStrip } from '../components/MoveStrip';
import { RichText } from '../components/RichText';
import { Screen } from '../components/Screen';
import { useEngine } from '../engine';
import type { Navigate } from '../routes';
import { saveBookmark, usePref } from '../storage';

interface StudyProps {
  rep: Repertoire;
  book: Book;
  side: Color;
  /** The chapter and line being read, when the board was opened from one. */
  chapter?: Chapter;
  line?: Line;
  path: string[];
  cursor?: number;
  review?: boolean;
  navigate: Navigate;
  back: () => void;
}

const sideName = (color: Color) => (color === 'white' ? 'White' : 'Black');
const moverOf = (ply: number): Color => (ply % 2 === 0 ? 'white' : 'black');

/**
 * Marks the side's own moves worth a second look: 'bad' where the notes call
 * the move a mistake, 'warn' where the notes had a repertoire move and
 * something else was played.
 */
function markPath(rep: Repertoire, side: Color, scope: number | undefined, path: readonly string[], keys: readonly number[]) {
  return path.map((uci, ply) => {
    if (moverOf(ply) !== side) return undefined;
    const move = rep.move(side, keys[ply]!, uci);
    if (move) return viewOf(move, scope).kind === 'mistake' ? ('bad' as const) : undefined;
    const known = rep.at(side, keys[ply]!)?.moves.some(other => viewOf(other, scope).kind === 'repertoire');
    return known ? ('warn' as const) : undefined;
  });
}

/**
 * The board every chapter is read on. It shows what the notes say about the
 * position, the moves from it (noted moves first, then what elite players
 * play), and Stockfish when it is switched on. Any move can be played, so it
 * is also the analysis board.
 */
export function Study({ rep, book, side: initialSide, chapter, line, path: initialPath, cursor: initialCursor, review, navigate, back }: StudyProps) {
  const [side, setSide] = useState(initialSide);
  const [path, setPath] = useState(initialPath);
  const [cursor, setCursor] = useState(() => {
    if (initialCursor !== undefined) return initialCursor;
    if (!review) return initialPath.length;
    // A review opens on the first move that left the notes.
    const scope = chapter?.side === initialSide ? chapter.index : undefined;
    const first = markPath(rep, initialSide, scope, initialPath, trace(initialPath).keys).findIndex(Boolean);
    return first === -1 ? initialPath.length : first + 1;
  });
  const [engineOn, setEngineOn] = usePref('engine', false);
  const [wide, setWide] = usePref('engineWide', false);

  const { steps, keys } = useMemo(() => trace(path), [path]);
  const pos = useMemo(() => positionAfter(path.slice(0, cursor)), [path, cursor]);
  const fen = steps[cursor - 1]?.fenAfter ?? INITIAL_FEN;
  const over = pos.isEnd();
  const analysis = useEngine(engineOn && !over ? fen : undefined, wide ? 3 : 1);
  // A chapter's own reading of a move only applies while looking from its side.
  const scope = chapter?.side === side ? chapter.index : undefined;

  useEffect(() => {
    if (chapter && line) saveBookmark({ chapter: chapter.id, line: line.index, path, cursor });
  }, [chapter, line, path, cursor]);

  const marks = useMemo(() => markPath(rep, side, scope, path, keys), [rep, side, scope, path, keys]);

  const here = rep.at(side, keys[cursor]!);
  const last = steps[cursor - 1];
  const arrived = cursor > 0 ? rep.move(side, keys[cursor - 1]!, path[cursor - 1]!) : undefined;
  // Reached by a move the notes do not have, but the position itself is in them.
  const transposed = !arrived && cursor > 0 ? here?.arrivals[0] : undefined;
  const note: MoveView | undefined = arrived ? viewOf(arrived, scope) : transposed ? viewOf(transposed, scope) : undefined;

  const view = useMemo(() => {
    const bookMoves = book.moves(pos);
    const byUci = new Map(bookMoves.map(entry => [entry.uci, entry]));
    const noted: MoveRow[] = (here ? rankMoves(here.moves, scope) : []).map(({ move, view }) => ({
      uci: move.uci,
      san: move.san,
      view,
      entry: byUci.get(move.uci),
    }));
    const others: MoveRow[] = bookMoves
      .filter(entry => !noted.some(row => row.uci === entry.uci))
      .map(entry => ({ uci: entry.uci, san: entry.san, entry }));
    return { noted, others };
  }, [book, pos, here, scope]);

  const onLine = line !== undefined && cursor <= line.main.length && line.main.slice(0, cursor).every((uci, i) => uci === path[i]);
  const lineMove = onLine ? line.main[cursor] : undefined;
  const next = path[cursor] ?? lineMove ?? (view.noted.find(row => row.view?.kind !== 'mistake') ?? view.noted[0])?.uci;

  const play = (uci: string) => {
    if (path[cursor] !== uci) setPath([...path.slice(0, cursor), uci]);
    setCursor(cursor + 1);
  };

  // What to say about the move that was just played when the notes do not have it.
  const stray = useMemo(() => {
    if (cursor === 0 || arrived) return undefined;
    const ply = cursor - 1;
    const before = positionAfter(path.slice(0, ply));
    const share = book.moves(before).find(entry => entry.uci === path[ply])?.share;
    const parent = rep.at(side, keys[ply]!);
    const expected = moverOf(ply) === side && parent ? rankMoves(parent.moves, scope).filter(row => row.view.kind === 'repertoire') : [];
    return { share, expected, covered: parent !== undefined };
  }, [cursor, arrived, path, book, rep, side, keys, scope]);

  let covered = cursor;
  while (covered > 0 && !rep.at(side, keys[covered]!)) covered--;

  const title = chapter?.title ?? (review ? 'Game review' : 'Analysis board');
  let subtitle = line?.name;
  if (!subtitle) {
    const sample = here?.moves[0] ?? here?.arrivals[0];
    subtitle = sample ? `In your notes: ${rep.chapters[viewOf(sample).chapter]!.title}` : `${sideName(side)}'s notes do not cover this position`;
  }
  const tag = tagOf(note);
  const nextLine = chapter && line ? chapter.lines[line.index + 1] : undefined;
  const turn = pos.turn;
  const flagged = marks.flatMap((mark, ply) => (mark ? [ply] : []));

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      onBack={back}
      variant={engineOn ? 'study engine-on' : 'study'}
      resetKey={`${keys[cursor]}:${cursor}`}
      fixed={
        <>
          <Board
            fen={fen}
            orientation={side}
            interactive
            lastMove={last?.squares}
            shapes={arrived ? shapesOf(note?.shapes) : []}
            onMove={(move: NormalMove) => play(uciOf(pos, move))}
          />
          {engineOn && (
            <EnginePanel fen={fen} analysis={analysis} over={over} wide={wide} onWide={setWide} onPlay={play} />
          )}
          <MoveStrip moves={steps.map((step, ply) => ({ san: step.san, tone: marks[ply] }))} cursor={cursor} onSelect={setCursor} />
        </>
      }
      footer={
        <>
          <button className="tool" onClick={() => setCursor(cursor - 1)} disabled={cursor === 0} aria-label="Previous move">
            ‹
          </button>
          <button className="tool" onClick={() => next && play(next)} disabled={!next} aria-label="Next move">
            ›
          </button>
          <button className="tool label" onClick={() => setSide(side === 'white' ? 'black' : 'white')}>
            Flip
          </button>
          <button className={`tool label${engineOn ? ' on' : ''}`} onClick={() => setEngineOn(!engineOn)} aria-pressed={engineOn}>
            Engine
          </button>
        </>
      }
    >
      <section className="note">
        {cursor === 0 || !last ? (
          <>
            <h2>{line ? line.name : review ? 'Your game' : 'Starting position'}</h2>
            {line ? (
              <p className="muted">{line.summary}</p>
            ) : (
              <p className="muted">
                Play moves for both sides. Positions from your notes show their explanations; elsewhere the book of
                elite games and the engine take over.
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className={tag?.tone ?? (marks[cursor - 1] === 'warn' ? 'warn' : '')}>
              <span className="muted">{moveNumber(cursor - 1)}</span> {last.san}
              {arrived && note?.glyph}
              {arrived && tag && <span className={`tag ${tag.tone}`}>{tag.label}</span>}
            </h2>
            {stray && (
              <p className="muted">
                {stray.expected.length > 0
                  ? 'This is not the move in your notes.'
                  : stray.covered
                    ? 'Your notes do not mention this move.'
                    : 'Outside your notes.'}
                {stray.share !== undefined && ` Elite players choose it in ${formatShare(stray.share)} of games here.`}
              </p>
            )}
            {stray?.expected.map(({ move, view: expectedView }) => (
              <button
                key={move.uci}
                className="chip good"
                onClick={() => {
                  setPath([...path.slice(0, cursor - 1), move.uci]);
                }}
              >
                Show {moveNumber(cursor - 1)} {move.san}
                {expectedView.glyph}, the repertoire move
              </button>
            ))}
            {transposed && note?.text && (
              <p className="muted">
                The position is in your notes by another move order ({transposed.san}):
              </p>
            )}
            {note?.text && <RichText text={note.text} />}
          </>
        )}
        {review && cursor === 0 && (
          <p className="muted">
            {flagged.length === 0
              ? 'Every move of yours was in the notes or outside what they cover.'
              : `${flagged.length} of your moves ${flagged.length === 1 ? 'is' : 'are'} marked in the move list above.`}
          </p>
        )}
        {!here && covered < cursor && cursor > 0 && (
          <button className="chip" onClick={() => setCursor(covered)}>
            Back to the last position in your notes
          </button>
        )}
      </section>

      {onLine && cursor === line.main.length && chapter && (
        <section className="panel line-end">
          <h2>End of this line</h2>
          <div className="actions">
            <button className="btn" onClick={() => navigate({ screen: 'train', chapter: chapter.id, line: line.index })}>
              Train it
            </button>
            {nextLine && (
              <button
                className="btn primary"
                onClick={() =>
                  navigate(
                    { screen: 'study', side: chapter.side, chapter: chapter.id, line: nextLine.index, path: nextLine.main, cursor: lineStart(chapter, nextLine) },
                    { replace: true },
                  )
                }
              >
                Next line
              </button>
            )}
          </div>
          {nextLine && <p className="muted">Next: {nextLine.name}</p>}
        </section>
      )}

      {over ? (
        <p className="muted pad">The game is over in this position.</p>
      ) : (
        <>
          {view.noted.length > 0 && (
            <section>
              <h2>{turn === side ? `${sideName(turn)} to move: your notes` : `${sideName(turn)}'s replies in your notes`}</h2>
              <MoveRows rows={view.noted} onPlay={play} />
            </section>
          )}
          {view.others.length > 0 && (
            <section>
              <h2>{view.noted.length > 0 ? 'Also played in elite games' : `${sideName(turn)} to move: elite games`}</h2>
              <MoveRows rows={view.others.slice(0, view.noted.length > 0 ? 5 : 8)} onPlay={play} />
            </section>
          )}
          {view.noted.length === 0 && view.others.length === 0 && (
            <p className="muted pad">
              No notes and no elite games from here.{' '}
              {engineOn ? 'The engine line above continues the analysis.' : 'Turn on the engine to keep analysing.'}
            </p>
          )}
        </>
      )}
    </Screen>
  );
}
