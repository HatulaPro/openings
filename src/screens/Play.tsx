import type { NormalMove } from 'chessops/types';
import { INITIAL_FEN } from 'chessops/fen';
import { useEffect, useMemo, useState } from 'react';
import type { Book } from '../chess/book';
import { moveFromUci, positionAfter, trace, uciOf } from '../chess/game';
import type { Chapter, Line, Repertoire } from '../chess/repertoire';
import { pickReply } from '../chess/replies';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { Screen } from '../components/Screen';
import { recordReply, tallyAt } from '../replyHistory';
import type { Navigate } from '../routes';

const REPLY_DELAY_MS = 500;

interface PlayProps {
  rep: Repertoire;
  book: Book;
  chapter: Chapter;
  /** Have the computer follow this line for as long as it lasts. */
  line?: Line;
  navigate: Navigate;
  back: () => void;
}

/**
 * A practice game in one chapter. The computer steers into the chapter, then
 * answers as elite players do, choosing among the replies the notes cover
 * while there are any. The game ends when it leaves both the notes and the
 * book, and is then reviewed on the study board.
 */
export function Play({ rep, book, chapter, line, navigate, back }: PlayProps) {
  const side = chapter.side;
  const [moves, setMoves] = useState<string[]>([]);

  const game = useMemo(() => {
    const { steps, keys } = trace(moves);
    const pos = positionAfter(moves);
    const key = keys[moves.length]!;
    const bookMoves = book.moves(pos);
    const noted = rep.at(side, key);
    return { steps, pos, key, bookMoves, noted };
  }, [moves, book, rep, side]);

  const { pos, key, bookMoves, noted } = game;
  const replying = pos.turn !== side;
  // The player's last move left everything the app knows about.
  const lost = replying && moves.length > 0 && !noted && !book.stats(key);

  const reply = useMemo((): NormalMove | undefined => {
    if (!replying || pos.isEnd() || lost) return undefined;
    const onLine = line && line.main.slice(0, moves.length).every((uci, i) => uci === moves[i]);
    if (onLine && line.main[moves.length]) return moveFromUci(line.main[moves.length]!);
    const covered = noted?.moves.filter(move => move.occurrences.some(occurrence => occurrence.chapter === chapter.index)) ?? [];
    let pool = bookMoves;
    if (covered.length) {
      pool = bookMoves.filter(entry => covered.some(move => move.uci === entry.uci));
      if (!pool.length) return moveFromUci(covered[0]!.uci);
    }
    if (!pool.length) return undefined;
    return pickReply(pool, tallyAt(key)).move;
    // One pick per position: the tally read here changes when the reply is recorded.
  }, [replying, key]);

  const over = pos.isEnd() || lost || (replying && !reply);

  const review = (replace: boolean) =>
    navigate({ screen: 'study', side, chapter: chapter.id, path: moves, review: true }, { replace });

  useEffect(() => {
    if (over) {
      const timer = setTimeout(() => review(true), REPLY_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (!reply) return;
    const timer = setTimeout(() => {
      const uci = uciOf(pos, reply);
      recordReply(key, uci);
      setMoves(prev => [...prev, uci]);
    }, REPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [over, reply, key]);

  const last = game.steps.at(-1);
  return (
    <Screen
      title={line ? line.name : chapter.title}
      subtitle={`Practice game as ${side === 'white' ? 'White' : 'Black'}`}
      onBack={back}
      fixed={
        <Board
          fen={last?.fenAfter ?? INITIAL_FEN}
          orientation={side}
          interactive={!replying && !over}
          lastMove={last?.squares}
          onMove={move => setMoves(prev => [...prev, uciOf(pos, move)])}
        />
      }
    >
      <p className="status">{over ? 'Out of book: opening the review…' : replying ? 'Opponent to move…' : 'Your move'}</p>
      <MoveList moves={game.steps.map(step => ({ san: step.san }))} />
      <div className="actions">
        <button className="btn" onClick={() => setMoves([])} disabled={!moves.length}>
          Restart
        </button>
        <button className="btn primary" onClick={() => review(false)} disabled={!moves.length}>
          Stop and review
        </button>
      </div>
    </Screen>
  );
}
