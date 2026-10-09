import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Chess, normalizeMove } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { parseFen } from 'chessops/fen';
import type { NormalMove, Role } from 'chessops/types';
import { opposite, parseSquare } from 'chessops/util';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Color } from '../chess/game';
import { playMoveSound } from '../sound';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';

export interface BoardProps {
  fen: string;
  orientation: Color;
  /** Let the side to move play. The move is reported through onMove, which must update `fen`. */
  interactive?: boolean;
  /**
   * A board that never takes moves and lets touches scroll the page. Only
   * read when the board is created, so it cannot be combined with `interactive`.
   */
  preview?: boolean;
  /**
   * The other side is about to move by itself: let the player queue an answer
   * meanwhile. It is played, if still legal, as soon as the board turns `interactive`.
   */
  premove?: boolean;
  lastMove?: [Key, Key];
  shapes?: DrawShape[];
  onMove?: (move: NormalMove) => void;
}

const PROMOTIONS: { role: Role; glyph: string }[] = [
  { role: 'queen', glyph: '♛' },
  { role: 'knight', glyph: '♞' },
  { role: 'rook', glyph: '♜' },
  { role: 'bishop', glyph: '♝' },
];

function pieceCount(fen: string): number {
  return fen.split(' ')[0]!.replace(/[^a-z]/gi, '').length;
}

export function Board({
  fen,
  orientation,
  interactive = false,
  preview = false,
  premove = false,
  lastMove,
  shapes,
  onMove,
}: BoardProps) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [promotion, setPromotion] = useState<{ from: Key; to: Key } | null>(null);

  const pos = useMemo(() => Chess.fromSetup(parseFen(fen).unwrap()).unwrap(), [fen]);

  // Callers pass fresh arrays on every render. Comparing by content keeps a
  // re-render from resetting the board in the middle of an animation.
  const lastMoveSig = lastMove?.join('') ?? '';
  const shapesSig = JSON.stringify(shapes ?? []);
  const config = useMemo(
    (): Config => ({
      fen,
      orientation,
      turnColor: pos.turn,
      check: pos.isCheck(),
      lastMove,
      movable: {
        color: interactive ? pos.turn : premove ? opposite(pos.turn) : undefined,
        dests: interactive ? chessgroundDests(pos) : new Map(),
      },
      premovable: { enabled: premove },
      drawable: { autoShapes: shapes ?? [] },
    }),
    [fen, orientation, interactive, premove, lastMoveSig, shapesSig],
  );

  const latest = useRef({ pos, config, onMove });
  latest.current = { pos, config, onMove };

  const report = (from: Key, to: Key, role?: Role) => {
    const move = { from: parseSquare(from)!, to: parseSquare(to)!, promotion: role };
    latest.current.onMove?.(normalizeMove(latest.current.pos, move) as NormalMove);
  };

  useEffect(() => {
    const initial = latest.current.config;
    const cg = Chessground(host.current!, {
      ...initial,
      viewOnly: preview,
      animation: { duration: 180 },
      drawable: { ...initial.drawable, enabled: false },
      movable: {
        ...initial.movable,
        free: false,
        events: {
          after: (from, to) => {
            const promotes = cg.state.pieces.get(to)?.role === 'pawn' && (to[1] === '8' || to[1] === '1');
            if (promotes) setPromotion({ from, to });
            else report(from, to);
          },
        },
      },
    });
    api.current = cg;
    return () => cg.destroy();
  }, []);

  useEffect(() => {
    setPromotion(null);
    api.current?.set(config);
    // A queued move goes through `movable.events.after` like one made by hand.
    if (interactive) api.current?.playPremove();
    else if (!premove) api.current?.cancelPremove();
  }, [config]);

  // Every move that reaches the board is heard: yours, the opponent's, and stepping through a line.
  const heard = useRef(fen);
  useEffect(() => {
    const before = heard.current;
    heard.current = fen;
    if (preview || fen === before || !lastMove) return;
    playMoveSound(pieceCount(fen) < pieceCount(before) ? 'capture' : 'move');
  }, [fen]);

  return (
    <div className="board">
      <div ref={host} className="board-host" />
      {promotion && (
        <div
          className="promotion"
          onClick={() => {
            // Cancelled: put the pawn back.
            setPromotion(null);
            api.current?.set(config);
          }}
        >
          <div className="promotion-choices">
            {PROMOTIONS.map(({ role, glyph }) => (
              <button
                key={role}
                aria-label={`Promote to ${role}`}
                onClick={event => {
                  event.stopPropagation();
                  setPromotion(null);
                  report(promotion.from, promotion.to, role);
                }}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
