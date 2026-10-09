import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';

const BRUSHES: Record<string, string> = { G: 'green', R: 'red', Y: 'yellow', B: 'blue' };

/** Board marks from the notes ("Gd2d4" is an arrow, "Rd5" a square) as chessground shapes. */
export function shapesOf(marks: readonly string[] | undefined): DrawShape[] {
  return (marks ?? []).map(mark => ({
    orig: mark.slice(1, 3) as Key,
    dest: mark.length > 3 ? (mark.slice(3, 5) as Key) : undefined,
    brush: BRUSHES[mark[0]!] ?? 'green',
  }));
}
