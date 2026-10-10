import { INITIAL_FEN } from 'chessops/fen';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import type { Color } from '../chess/game';
import { Board } from '../components/Board';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { playMoveSound } from '../sound';
import { usePref } from '../storage';

type Pov = Color | 'both';

const POVS: { value: Pov; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'both', label: 'Both' },
  { value: 'black', label: 'Black' },
];

/** Seconds a run lasts; 0 runs until stopped. */
const DURATIONS = [
  { value: 30, label: '30 sec' },
  { value: 60, label: '1 min' },
  { value: 0, label: 'No limit' },
];

const ARROWS = [
  { value: 0, label: 'No arrows' },
  { value: 1, label: 'Arrows' },
];

const FILES = 'abcdefgh';
const TICK_MS = 100;

interface Target {
  square: string;
  /** The side at the bottom of the board while this square is asked. */
  pov: Color;
}

/** A tapped square, by where it is on the screen. */
interface Mark {
  id: number;
  col: number;
  row: number;
  /** A miss names the square that was tapped instead. */
  miss?: string;
}

interface Result {
  hits: number;
  misses: number;
  ms: number;
  /** The best score with these settings before this run; timed runs only. */
  best?: number;
}

function pick(pov: Pov, previous?: string): Target {
  let square: string;
  do square = FILES[Math.floor(Math.random() * 8)]! + (1 + Math.floor(Math.random() * 8));
  while (square === previous);
  return { square, pov: pov === 'both' ? (Math.random() < 0.5 ? 'white' : 'black') : pov };
}

function clock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** An arrow along an edge of the board, from the a-file to the h-file or the first rank to the eighth. */
function Arrow({ kind, pov }: { kind: 'files' | 'ranks'; pov: Color }) {
  return (
    <span className={`coords-arrow ${kind} ${pov}`} aria-hidden>
      <i className="shaft" />
      <i className="head" />
    </span>
  );
}

/**
 * Learning the names of the squares: one is named, and it is tapped as fast as
 * possible. A miss is counted and shown, and the same square stays asked.
 */
export function Coords({ back }: { back: () => void }) {
  const [pov, setPov] = usePref<Pov>('coords.pov', 'white');
  const [seconds, setSeconds] = usePref('coords.seconds', 30);
  const [arrows, setArrows] = usePref('coords.arrows', 0);
  const [bests, setBests] = usePref<Record<string, number>>('coords.best', {});

  const [phase, setPhase] = useState<'setup' | 'run' | 'done'>('setup');
  const [target, setTarget] = useState<Target>(() => pick(pov));
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const startedAt = useRef(0);
  const markId = useRef(0);

  const limit = seconds * 1000;
  const record = `${pov}:${seconds}`;

  const start = () => {
    startedAt.current = performance.now();
    setHits(0);
    setMisses(0);
    setElapsed(0);
    setMarks([]);
    setResult(null);
    setTarget(pick(pov));
    setPhase('run');
  };

  const finish = (ms: number) => {
    const best = limit ? bests[record] : undefined;
    setResult({ hits, misses, ms, best });
    if (limit && hits > (best ?? 0)) setBests({ ...bests, [record]: hits });
    setElapsed(ms);
    setPhase('done');
  };
  const latest = useRef(finish);
  latest.current = finish;

  useEffect(() => {
    if (phase !== 'run') return;
    const timer = setInterval(() => {
      const ms = performance.now() - startedAt.current;
      if (limit && ms >= limit) latest.current(limit);
      else setElapsed(ms);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  const onTap = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== 'run' || (limit && performance.now() - startedAt.current >= limit)) return;
    const box = event.currentTarget.getBoundingClientRect();
    const cell = (offset: number, size: number) => Math.min(7, Math.max(0, Math.floor((offset / size) * 8)));
    const col = cell(event.clientX - box.left, box.width);
    const row = cell(event.clientY - box.top, box.height);
    const white = target.pov === 'white';
    const square = FILES[white ? col : 7 - col]! + (white ? 8 - row : row + 1);
    const id = ++markId.current;
    if (square === target.square) {
      setHits(count => count + 1);
      setMarks([{ id, col, row }]);
      setTarget(pick(pov, square));
      playMoveSound('move');
    } else {
      setMisses(count => count + 1);
      setMarks(shown => [...shown.filter(mark => mark.miss && mark.miss !== square), { id, col, row, miss: square }]);
    }
  };

  const running = phase === 'run';
  const orientation = running ? target.pov : pov === 'both' ? 'white' : pov;

  return (
    <Screen
      title="Coordinates"
      subtitle="Tap the named square as fast as you can"
      onBack={back}
      variant="coords"
      fixed={
        <>
          <div className="coords-head">
            <span className="coords-score">
              <span className="level good">✓ {hits}</span>
              <span className={misses ? 'level bad' : 'muted'}>✗ {misses}</span>
            </span>
            <span className="coords-target">{running ? target.square : ''}</span>
            <span className="coords-time">{clock(limit ? limit - elapsed : elapsed)}</span>
          </div>
          {/* Kept out of sight until the first run, so the first square is found on a board not yet studied. */}
          {phase !== 'setup' && (
            <div className={arrows ? 'coords-field arrows' : 'coords-field'}>
              {arrows > 0 && <Arrow kind="ranks" pov={orientation} />}
              <div className="coords-board">
                <Board fen={INITIAL_FEN} orientation={orientation} preview coordinates={false} />
                <div className="coords-touch" onPointerDown={onTap}>
                  {marks.map(mark => (
                    <span
                      key={mark.id}
                      className={mark.miss ? 'coords-mark bad' : 'coords-mark good'}
                      style={{ left: `${mark.col * 12.5}%`, top: `${mark.row * 12.5}%` }}
                    >
                      {mark.miss}
                    </span>
                  ))}
                </div>
              </div>
              {arrows > 0 && <Arrow kind="files" pov={orientation} />}
            </div>
          )}
        </>
      }
      footer={
        running ? (
          <button className="btn" onClick={() => finish(performance.now() - startedAt.current)}>
            Stop
          </button>
        ) : (
          <button className="btn primary" onClick={start}>
            {result ? 'Again' : 'Start'}
          </button>
        )
      }
    >
      {result && !running && (
        <div className="panel">
          <h2>
            {result.hits} {result.hits === 1 ? 'square' : 'squares'} in {clock(result.ms)}
          </h2>
          <p>
            {result.misses} {result.misses === 1 ? 'miss' : 'misses'}
            {result.hits + result.misses > 0 &&
              ` · ${Math.round((100 * result.hits) / (result.hits + result.misses))}% accurate`}
            {result.hits > 0 && ` · ${(result.ms / result.hits / 1000).toFixed(2)} s a square`}
          </p>
          {limit > 0 && result.best !== undefined && (
            <p className={result.hits > result.best ? 'level good' : 'muted'}>
              {result.hits > result.best ? `New best: the old one was ${result.best}` : `Best: ${result.best}`}
            </p>
          )}
        </div>
      )}
      {!running && (
        <div className="coords-options">
          <span className="muted">Board seen from</span>
          <Segmented label="Board seen from" value={pov} options={POVS} onChange={setPov} />
          <span className="muted">Time</span>
          <Segmented label="Time" value={seconds} options={DURATIONS} onChange={setSeconds} />
          <span className="muted">Direction of the files and ranks</span>
          <Segmented label="Direction arrows" value={arrows} options={ARROWS} onChange={setArrows} />
        </div>
      )}
    </Screen>
  );
}
