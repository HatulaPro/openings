import { INITIAL_FEN } from 'chessops/fen';
import type { NormalMove } from 'chessops/types';
import { useEffect, useMemo, useState } from 'react';
import { moveFromUci, moveNumber, moveSquares, playStep, positionAfter, type Step, trace, uciOf } from '../chess/game';
import { type Chapter, type Line, type Repertoire, viewOf } from '../chess/repertoire';
import { shapesOf } from '../chess/shapes';
import { Board } from '../components/Board';
import { RichText, teaser } from '../components/RichText';
import { Screen } from '../components/Screen';
import { MasteryBar } from '../components/Mastery';
import { masteryOf, recordAnswer, type Standing, standingOf } from '../progress';
import type { Navigate } from '../routes';

const REPLY_MS = 380;
const WRONG_MS = 650;
/** A run without a miss rolls straight into the next one. */
const NEXT_MS = 1600;
/** Keeps branches that are already solid turning up now and then. */
const KNOWN_WEIGHT = 0.2;
/** How strongly a position pulls the opponent towards it. */
const DUE: Record<Standing, number> = { missed: 3, fading: 2, untested: 1, learning: 1, solid: 0 };

/** What is said about a move that was not accepted. */
interface Feedback {
  label: string;
  tone: 'bad' | 'warn';
  text: string;
}

interface TrainProps {
  rep: Repertoire;
  chapter: Chapter;
  /** Train one line and its side branches instead of the whole chapter. */
  line?: Line;
  navigate: Navigate;
  back: () => void;
}

/**
 * Learning a chapter as a quick game. The opponent plays any reply the notes
 * cover, preferring branches with positions that were missed, are fading or
 * were never asked, and every
 * move of the repertoire has to be found on the board. A right move is
 * answered at once; a wrong one is taken back, explained and shown. A run
 * ends where the notes end, and the next one takes another path.
 */
export function Train({ rep, chapter, line, navigate, back }: TrainProps) {
  const side = chapter.side;
  const scope = line?.index;
  // The moves that define the chapter are played for you.
  const start = useMemo(() => chapter.lines[scope ?? 0]!.main.slice(0, chapter.root), [chapter, scope]);
  const asked = useMemo(() => rep.puzzles(chapter, scope).map(puzzle => puzzle.key), [rep, chapter, scope]);

  const [path, setPath] = useState(start);
  const [wrong, setWrong] = useState<Step | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const [reveal, setReveal] = useState(false);
  const [failed, setFailed] = useState(false);
  const [run, setRun] = useState({ asked: 0, missed: 0 });
  const [streak, setStreak] = useState(0);
  const [open, setOpen] = useState(-1);

  const { steps, keys } = useMemo(() => trace(path), [path]);
  const pos = useMemo(() => positionAfter(path), [path]);
  const key = keys[path.length]!;
  const options = useMemo(() => rep.options(chapter, key, scope), [rep, chapter, key, scope]);
  const mine = pos.turn === side;
  const phase = wrong ? 'wrong' : !options.length ? 'done' : mine ? 'ask' : 'opponent';

  const newRun = () => {
    setPath(start);
    setRun({ asked: 0, missed: 0 });
    setFeedback(undefined);
    setReveal(false);
    setFailed(false);
    setOpen(-1);
  };

  /** The opponent's move: any covered reply, weighted by how much below it is still to be learned. */
  const pickReply = (): string => {
    const memo = new Map<number, number>();
    const now = Date.now();
    const due = (from: number, myTurn: boolean): number => {
      const known = memo.get(from);
      if (known !== undefined) return known;
      memo.set(from, 0); // a transposition back to here adds nothing
      const moves = rep.options(chapter, from, scope);
      let total = myTurn && moves.length ? DUE[standingOf(side, from, now)] : 0;
      for (const move of moves) total += due(move.to, !myTurn);
      memo.set(from, total);
      return total;
    };
    const weights = options.map(move => due(move.to, true) + KNOWN_WEIGHT);
    let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) return options[i]!.uci;
    }
    return options[options.length - 1]!.uci;
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (phase === 'opponent') timer = setTimeout(() => setPath(prev => [...prev, pickReply()]), REPLY_MS);
    if (phase === 'wrong') {
      timer = setTimeout(() => {
        setWrong(null);
        // After a real miss the move is shown; after a playable alternative it is asked again.
        setReveal(failed);
      }, WRONG_MS);
    }
    if (phase === 'done' && run.asked > 0 && run.missed === 0) timer = setTimeout(newRun, NEXT_MS);
    return () => clearTimeout(timer);
    // The handlers only read state that cannot change while a phase is on screen.
  }, [phase, key]);

  const onMove = (move: NormalMove) => {
    const uci = uciOf(pos, move);
    if (options.some(option => option.uci === uci)) {
      recordAnswer(side, key, !failed);
      setRun({ asked: run.asked + 1, missed: run.missed + (failed ? 1 : 0) });
      setStreak(failed ? 0 : streak + 1);
      setFailed(false);
      setFeedback(undefined);
      setReveal(false);
      setOpen(-1);
      setPath([...path, uci]);
      return;
    }
    const step = playStep(pos.clone(), move);
    const noted = rep.move(side, key, uci);
    const view = noted && viewOf(noted, chapter.index);
    const label = `${moveNumber(path.length)} ${step.san}${view?.glyph ?? ''}`;
    if (view?.kind === 'repertoire') {
      const where = rep.chapters[view.chapter]?.lines[view.line]?.name;
      setFeedback({ label, tone: 'warn', text: `Your repertoire too, in “${where}”. This session follows another move here.` });
    } else if (view?.kind === 'alternative') {
      setFeedback({ label, tone: 'warn', text: view.text ?? 'Playable, but not the repertoire move. Try again.' });
    } else {
      setFailed(true);
      setFeedback({
        label,
        tone: 'bad',
        text: view?.text ?? (view ? 'The notes show this move only in passing.' : 'Not in your notes here.'),
      });
    }
    setWrong(step);
  };

  // The two most recent moves and what the notes say about them: yours, and the opponent's answer.
  const recent = [path.length - 1, path.length - 2]
    .filter(ply => ply >= 0)
    .map(ply => {
      const move = rep.move(side, keys[ply]!, path[ply]!);
      const view = move && viewOf(move, chapter.index);
      const own = (ply % 2 === 0 ? 'white' : 'black') === side;
      return { ply, own, san: steps[ply]!.san, view };
    })
    .sort((a, b) => Number(b.own) - Number(a.own));

  const mastery = masteryOf(side, asked);
  const last = steps.at(-1);
  const lastNote = recent.find(entry => entry.ply === path.length - 1)?.view;
  const sideName = side === 'white' ? 'White' : 'Black';
  const answers = options.map(option => `${moveNumber(path.length)} ${option.san}`);

  let status: string;
  let tone = '';
  if (phase === 'done') {
    status = run.asked === 0 ? 'Nothing to train here.' : `Line complete: ${run.asked - run.missed} of ${run.asked} at the first attempt`;
    tone = run.missed === 0 ? 'good' : '';
  } else if (phase === 'wrong') {
    status = feedback?.tone === 'bad' ? 'Not that one' : 'Not the repertoire move';
    tone = feedback?.tone ?? '';
  } else if (reveal) {
    status = `Play ${answers.join(' or ')}`;
    tone = 'good';
  } else if (phase === 'opponent') {
    status = '';
  } else {
    status = options.length > 1 ? `${sideName} to move: ${options.length} repertoire moves here` : `${sideName} to move`;
  }

  const shapes =
    reveal && phase === 'ask'
      ? shapesOf(options.map(option => `G${moveSquares(pos, moveFromUci(option.uci)).join('')}`))
      : phase === 'wrong'
        ? []
        : shapesOf(lastNote?.shapes);

  return (
    <Screen
      title={line ? line.name : chapter.title}
      subtitle={`${mastery.total - mastery.untested} of ${mastery.total} positions tested · ${mastery.solid} solid${streak > 1 ? ` · ${streak} in a row` : ''}`}
      onBack={back}
      variant="study"
      fixed={
        <>
          <MasteryBar mastery={mastery} edge />
          <Board
            fen={wrong?.fenAfter ?? last?.fenAfter ?? INITIAL_FEN}
            orientation={side}
            interactive={phase === 'ask'}
            lastMove={wrong?.squares ?? last?.squares}
            shapes={shapes}
            onMove={onMove}
          />
        </>
      }
      footer={
        <>
          <button
            className="btn"
            onClick={() => navigate({ screen: 'study', side, chapter: chapter.id, line: scope, path })}
          >
            {phase === 'done' ? 'Study this line' : 'Study position'}
          </button>
          {phase === 'done' ? (
            <button className="btn primary" onClick={newRun} disabled={run.asked === 0}>
              Next line
            </button>
          ) : (
            <button
              className="btn"
              disabled={phase !== 'ask' || reveal}
              onClick={() => {
                setFailed(true);
                setReveal(true);
              }}
            >
              Show the move
            </button>
          )}
        </>
      }
    >
      <div className="train">
        <p className={`train-status ${tone}`}>{status}</p>
        {feedback && phase !== 'done' && (
          <div className={`train-note ${feedback.tone}`}>
            <span className="train-move">{feedback.label}</span>
            {teaser(feedback.text, 220)}
          </div>
        )}
        {recent.map(({ ply, own, san, view }) => (
          <button
            key={ply}
            className={`train-note${own ? ' good' : ''}`}
            disabled={!view?.text}
            onClick={() => setOpen(open === ply ? -1 : ply)}
          >
            <span className="train-move">
              {moveNumber(ply)} {san}
              {view?.glyph}
            </span>
            {view?.text && (open === ply ? <RichText text={view.text} /> : teaser(view.text, 150))}
          </button>
        ))}
      </div>
    </Screen>
  );
}
