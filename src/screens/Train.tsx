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
import { drillOf, drillsOf, isOff, MAIN_WEIGHT, recordPlayed, roleOf, setRole, useChoices } from '../choices';
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

/** The next line that is not solid yet: further down this chapter first, then through the rest of the repertoire. */
function nextLine(rep: Repertoire, chapter: Chapter, scope?: number): { chapter: Chapter; line: Line } | undefined {
  const now = Date.now();
  const count = rep.chapters.length;
  for (let c = 0; c < count; c++) {
    const other = rep.chapters[(chapter.index + c) % count]!;
    const from = c === 0 ? (scope ?? -1) + 1 : 0;
    for (let l = 0; l < other.lines.length; l++) {
      const line = other.lines[(from + l) % other.lines.length]!;
      const mastery = masteryOf(other.side, drillsOf(rep, other, line.index), now);
      if (mastery.solid < mastery.total) return { chapter: other, line };
    }
  }
  return undefined;
}

/** What is said about a move that was not accepted. */
interface Feedback {
  label: string;
  tone: 'bad' | 'warn';
  text: string;
  /** The status line while the move is shown, if not the usual one. */
  status?: string;
  /** A move that is turned off, offered to be turned back on. */
  turnOn?: string;
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
 *
 * Where the repertoire gives a choice of moves, the run asks for one of them,
 * picked the same way, so a favourite move does not hide the others. Moves
 * turned off are not asked when the whole chapter is trained.
 */
export function Train({ rep, chapter, line, navigate, back }: TrainProps) {
  const side = chapter.side;
  const scope = line?.index;
  // The moves that define the chapter are played for you.
  const start = useMemo(() => chapter.lines[scope ?? 0]!.main.slice(0, chapter.root), [chapter, scope]);
  const choices = useChoices();
  const asked = useMemo(() => drillsOf(rep, chapter, scope), [rep, chapter, scope, choices]);

  const [path, setPath] = useState(start);
  const [wrong, setWrong] = useState<Step | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const [reveal, setReveal] = useState(false);
  const [failed, setFailed] = useState(false);
  const [run, setRun] = useState({ asked: 0, missed: 0 });
  const [streak, setStreak] = useState(0);
  const [open, setOpen] = useState(-1);
  const [nudged, setNudged] = useState(false);
  /** At a choice, the move this run asks for. */
  const [target, setTarget] = useState<{ key: number; uci: string }>();
  /** Other moves of the choice already played here, which are right but not the one asked. */
  const [tried, setTried] = useState<string[]>([]);

  const mastery = masteryOf(side, asked);
  // Nothing left to learn here: say so, and point at a line that still needs work.
  const solid = mastery.total > 0 && mastery.solid === mastery.total;
  const next = useMemo(() => (solid ? nextLine(rep, chapter, scope) : undefined), [solid, rep, chapter, scope]);

  const { steps, keys } = useMemo(() => trace(path), [path]);
  const pos = useMemo(() => positionAfter(path), [path]);
  const key = keys[path.length]!;
  const options = useMemo(() => rep.options(chapter, key, scope), [rep, chapter, key, scope]);
  const mine = pos.turn === side;
  /** The moves that keep the game going from a position: without the ones turned off, unless one line is trained. */
  const movesFrom = (from: number, myTurn: boolean) => {
    const moves = rep.options(chapter, from, scope);
    return myTurn && scope === undefined ? moves.filter(move => !isOff(rep, side, from, move.uci)) : moves;
  };
  const active = useMemo(() => movesFrom(key, mine), [rep, chapter, key, scope, mine, choices]);
  const phase = wrong ? 'wrong' : !active.length ? 'done' : mine ? 'ask' : 'opponent';
  const wanted = phase !== 'opponent' && active.length > 1 && target?.key === key ? target.uci : undefined;

  const newRun = () => {
    setPath(start);
    setRun({ asked: 0, missed: 0 });
    setFeedback(undefined);
    setReveal(false);
    setFailed(false);
    setOpen(-1);
    setTarget(undefined);
    setTried([]);
    if (solid) setNudged(true);
  };

  /** How much is still to be learned from a position on: what is missed, fading or never asked. */
  const dueCounter = () => {
    const memo = new Map<number, number>();
    const now = Date.now();
    const due = (from: number, myTurn: boolean): number => {
      const known = memo.get(from);
      if (known !== undefined) return known;
      memo.set(from, 0); // a transposition back to here adds nothing
      let total = 0;
      for (const move of movesFrom(from, myTurn)) {
        if (myTurn) total += DUE[standingOf(side, drillOf(rep, side, from, move.uci), now)];
        total += due(move.to, !myTurn);
      }
      memo.set(from, total);
      return total;
    };
    return due;
  };

  const pickWeighted = (weights: number[]): string => {
    let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < active.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) return active[i]!.uci;
    }
    return active[active.length - 1]!.uci;
  };

  /** The opponent's move: any covered reply, weighted by how much below it is still to be learned. */
  const pickReply = (): string => {
    const due = dueCounter();
    return pickWeighted(active.map(move => due(move.to, true) + KNOWN_WEIGHT));
  };

  /** At a choice, the move to ask for: by what is still to be learned behind it, the main move favoured. */
  const pickTarget = (): string => {
    const due = dueCounter();
    const now = Date.now();
    return pickWeighted(
      active.map(
        move =>
          (DUE[standingOf(side, drillOf(rep, side, key, move.uci), now)] + due(move.to, false) + KNOWN_WEIGHT) *
          (roleOf(rep, side, key, move.uci) === 'main' ? MAIN_WEIGHT : 1),
      ),
    );
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (phase === 'opponent') timer = setTimeout(() => setPath(prev => [...prev, pickReply()]), REPLY_MS);
    if (phase === 'ask' && active.length > 1 && target?.key !== key) {
      setTarget({ key, uci: pickTarget() });
      setTried([]);
    }
    if (phase === 'wrong') {
      timer = setTimeout(() => {
        setWrong(null);
        // After a real miss the move is shown; after a playable alternative it is asked again.
        setReveal(failed);
      }, WRONG_MS);
    }
    // The first run that ends with everything solid waits, so the way on to another line is seen.
    if (phase === 'done' && run.asked > 0 && run.missed === 0 && (!solid || nudged)) timer = setTimeout(newRun, NEXT_MS);
    return () => clearTimeout(timer);
    // The handlers only read state that cannot change while a phase is on screen.
  }, [phase, key]);

  const roleName = (uci: string) => (roleOf(rep, side, key, uci) === 'main' ? 'main move' : 'other move');
  /** What the run asks for at a choice, without naming the move. */
  const wantedText = (() => {
    if (!wanted) return '';
    if (roleOf(rep, side, key, wanted) === 'main') return 'your main move';
    const left = active.filter(option => !tried.includes(option.uci) && roleOf(rep, side, key, option.uci) !== 'main');
    return left.length > 1 ? 'one of your other moves' : 'your other move';
  })();

  const onMove = (move: NormalMove) => {
    const uci = uciOf(pos, move);
    const accepted = active.some(option => option.uci === uci);
    if (accepted && (!wanted || uci === wanted)) {
      recordAnswer(side, drillOf(rep, side, key, uci), !failed);
      if (rep.isChoice(side, key)) recordPlayed(side, key, uci);
      setTarget(undefined);
      setTried([]);
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
    if (accepted) {
      // Another move of the choice: known, so it counts, but this run goes down another branch.
      if (!tried.includes(uci)) {
        recordAnswer(side, drillOf(rep, side, key, uci), true);
        setTried([...tried, uci]);
      }
      setFeedback({
        label,
        tone: 'warn',
        status: 'Right, but not this time',
        text: `That is your ${roleName(uci)} here. This run asks for ${wantedText}.`,
      });
    } else if (options.some(option => option.uci === uci)) {
      setFeedback({
        label,
        tone: 'warn',
        text: 'Your repertoire, but you turned this move off. Training follows your other moves here.',
        turnOn: uci,
      });
    } else if (view?.kind === 'repertoire') {
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

  const last = steps.at(-1);
  const lastNote = recent.find(entry => entry.ply === path.length - 1)?.view;
  const sideName = side === 'white' ? 'White' : 'Black';
  const answers = active.filter(option => !wanted || option.uci === wanted).map(option => `${moveNumber(path.length)} ${option.san}`);

  let status: string;
  let tone = '';
  if (phase === 'done') {
    status = run.asked === 0 ? 'Nothing to train here.' : `Line complete: ${run.asked - run.missed} of ${run.asked} at the first attempt`;
    tone = run.missed === 0 ? 'good' : '';
  } else if (phase === 'wrong') {
    status = feedback?.status ?? (feedback?.tone === 'bad' ? 'Not that one' : 'Not the repertoire move');
    tone = feedback?.tone ?? '';
  } else if (reveal) {
    status = `Play ${answers.join(' or ')}`;
    tone = 'good';
  } else if (phase === 'opponent') {
    status = '';
  } else {
    status = wanted ? `${sideName} to move: ${wantedText}` : active.length > 1 ? `${sideName} to move: ${active.length} repertoire moves here` : `${sideName} to move`;
  }

  const shapes =
    reveal && phase === 'ask'
      ? shapesOf(active.filter(option => !wanted || option.uci === wanted).map(option => `G${moveSquares(pos, moveFromUci(option.uci)).join('')}`))
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
            premove={phase === 'opponent'}
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
        {solid && (
          <button
            className="train-note good"
            disabled={!next}
            onClick={() => next && navigate({ screen: 'train', chapter: next.chapter.id, line: next.line.index }, { replace: true })}
          >
            <span className="train-move">
              Solid: you know all {mastery.total} positions of this {line ? 'line' : 'chapter'}
            </span>
            {next
              ? `Move on to “${next.line.name}”${next.chapter === chapter ? '' : ` in ${next.chapter.title}`} ›`
              : 'So is the rest of your repertoire.'}
          </button>
        )}
        {wanted && phase === 'ask' && (
          <div className="choice-slots" aria-label="Your moves here">
            {active.map(option => {
              const role = roleOf(rep, side, key, option.uci);
              const found = tried.includes(option.uci);
              return (
                <span key={option.uci} className={found ? 'slot found' : 'slot'}>
                  {found ? `${moveNumber(path.length)} ${option.san}` : '?'}
                  <span className="tag">{role === 'main' ? 'main' : 'other'}</span>
                </span>
              );
            })}
          </div>
        )}
        {feedback && phase !== 'done' && (
          <div className={`train-note ${feedback.tone}`}>
            <span className="train-move">{feedback.label}</span>
            {teaser(feedback.text, 220)}
            {feedback.turnOn && (
              <button
                className="btn small turn-on"
                onClick={() => {
                  setRole(rep, side, key, feedback.turnOn!, 'also');
                  setFeedback(undefined);
                }}
              >
                Turn it back on
              </button>
            )}
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
