import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { makeUci, parseUci } from 'chessops/util';
import { useEffect, useState } from 'react';

// Stockfish runs in a worker from public/engine (see scripts/fetch-engine.ts).
// It is the single-threaded build: Android's WebView offers no shared memory.

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;
/** The search stops here on its own, so an open board does not drain the battery. */
const MAX_DEPTH = 26;
const HASH_MB = 32;
const EMIT_MS = 120;

export interface EngineLine {
  /** Centipawns from White's side; a large stand-in when `mate` is set. */
  cp: number;
  /** Moves until mate, positive when White mates. */
  mate?: number;
  depth: number;
  /** The line in the engine's UCI, where castling is the king's two-square step. */
  pv: string[];
}

export interface Analysis {
  fen: string;
  depth: number;
  /** Best line first. */
  lines: EngineLine[];
  /** The search reached its depth limit or the position is decided. */
  done: boolean;
  failed?: boolean;
}

interface Job {
  fen: string;
  multipv: number;
  listener: (analysis: Analysis) => void;
  lines: EngineLine[];
  done: boolean;
}

function parseInfo(text: string, whiteToMove: boolean): { index: number; line: EngineLine } | undefined {
  if (!text.startsWith('info ') || !text.includes(' pv ')) return undefined;
  const tokens = text.split(' ');
  // A bound is not the line's score; the exact one follows.
  if (tokens.includes('lowerbound') || tokens.includes('upperbound')) return undefined;
  const score = tokens.indexOf('score');
  if (score === -1) return undefined;
  const value = Number(tokens[score + 2]) * (whiteToMove ? 1 : -1);
  const isMate = tokens[score + 1] === 'mate';
  const number = (name: string) => Number(tokens[tokens.indexOf(name) + 1]);
  return {
    index: tokens.includes('multipv') ? number('multipv') - 1 : 0,
    line: {
      cp: isMate ? Math.sign(value) * 100_000 : value,
      mate: isMate ? value : undefined,
      depth: number('depth'),
      pv: tokens.slice(tokens.indexOf('pv') + 1),
    },
  };
}

class EngineClient {
  private worker: Worker | undefined;
  private ready = false;
  private failed = false;
  /** A search is under way in the worker; it ends with a "bestmove" line. */
  private searching = false;
  private stopping = false;
  private multipv = 1;
  /** The job the screen wants, and the one the worker is on. */
  private wanted: Job | undefined;
  private running: Job | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  analyse(fen: string, multipv: number, listener: Job['listener']): void {
    this.wanted = { fen, multipv, listener, lines: [], done: false };
    this.pump();
  }

  halt(): void {
    this.wanted = undefined;
    this.pump();
  }

  private boot(): void {
    try {
      this.worker = new Worker(ENGINE_URL);
    } catch {
      this.fail();
      return;
    }
    this.worker.onmessage = event => this.receive(String(event.data));
    this.worker.onerror = () => this.fail();
    this.worker.postMessage('uci');
  }

  private fail(): void {
    this.failed = true;
    const job = this.wanted;
    job?.listener({ fen: job.fen, depth: 0, lines: [], done: true, failed: true });
  }

  private pump(): void {
    if (this.failed) {
      if (this.wanted) this.fail();
      return;
    }
    if (!this.worker) {
      if (this.wanted) this.boot();
      return;
    }
    if (!this.ready) return;
    if (this.searching) {
      if (this.running !== this.wanted && !this.stopping) {
        this.stopping = true;
        this.worker.postMessage('stop');
      }
      return;
    }
    const job = this.wanted;
    if (!job || job === this.running) return;
    if (job.multipv !== this.multipv) {
      this.multipv = job.multipv;
      this.worker.postMessage(`setoption name MultiPV value ${job.multipv}`);
    }
    this.running = job;
    this.searching = true;
    this.worker.postMessage(`position fen ${job.fen}`);
    this.worker.postMessage(`go depth ${MAX_DEPTH}`);
  }

  private receive(text: string): void {
    if (text === 'uciok') {
      this.worker!.postMessage(`setoption name Hash value ${HASH_MB}`);
      this.worker!.postMessage('isready');
    } else if (text === 'readyok') {
      this.ready = true;
      this.pump();
    } else if (text.startsWith('bestmove')) {
      this.searching = false;
      this.stopping = false;
      const job = this.running;
      if (job && job === this.wanted) {
        job.done = true;
        this.emit(job);
      }
      this.pump();
    } else if (this.running && this.running === this.wanted && !this.stopping) {
      const job = this.running;
      const parsed = parseInfo(text, job.fen.split(' ')[1] !== 'b');
      if (!parsed) return;
      job.lines[parsed.index] = parsed.line;
      this.timer ??= setTimeout(() => {
        this.timer = undefined;
        if (job === this.wanted) this.emit(job);
      }, EMIT_MS);
    }
  }

  private emit(job: Job): void {
    const lines = job.lines.filter(Boolean);
    job.listener({ fen: job.fen, depth: lines[0]?.depth ?? 0, lines: [...lines], done: job.done });
  }
}

const client = new EngineClient();

/** Live analysis of a position, or undefined while there is nothing to show. Pass no FEN to rest the engine. */
export function useEngine(fen: string | undefined, multipv: number): Analysis | undefined {
  const [analysis, setAnalysis] = useState<Analysis>();
  useEffect(() => {
    if (!fen) return;
    client.analyse(fen, multipv, setAnalysis);
    return () => client.halt();
  }, [fen, multipv]);
  return analysis && analysis.fen === fen ? analysis : undefined;
}

/** "+0.4", "-1.3", "#5" (White mates in five) or "#-2". */
export function formatEval(line: EngineLine): string {
  if (line.mate !== undefined) return `#${line.mate}`;
  const pawns = line.cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(Math.abs(pawns) >= 10 ? 0 : 1)}`;
}

/** White's share of the evaluation bar, from 0 to 1. */
export function whiteShare(line: EngineLine): number {
  if (line.mate !== undefined) return line.mate > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-0.004 * line.cp));
}

/** The first moves of an engine line in SAN with move numbers, and its first move in the app's UCI. */
export function describePv(fen: string, pv: readonly string[], maxPlies = 10): { text: string; first?: string } {
  const setup = parseFen(fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const parts: string[] = [];
  let first: string | undefined;
  let ply = (setup.fullmoves - 1) * 2 + (setup.turn === 'white' ? 0 : 1);
  for (const uci of pv.slice(0, maxPlies)) {
    const parsed = parseUci(uci);
    if (!parsed || !isNormal(parsed) || !pos.isLegal(parsed)) break;
    const move = normalizeMove(pos, parsed);
    if (!isNormal(move)) break;
    first ??= makeUci(move);
    const number = ply % 2 === 0 ? `${ply / 2 + 1}.` : parts.length ? '' : `${(ply + 1) / 2}...`;
    parts.push(number + makeSanAndPlay(pos, move));
    ply++;
  }
  return { text: parts.join(' '), first };
}
