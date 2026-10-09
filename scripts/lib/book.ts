import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Book } from '../../src/chess/book.ts';

/** The untrimmed book of elite games, when it has been built. */
export const FULL_BOOK = fileURLToPath(new URL('../../data/book-full.bin', import.meta.url));

export function loadFullBook(): Book | undefined {
  if (!existsSync(FULL_BOOK)) return undefined;
  const bytes = readFileSync(FULL_BOOK);
  return new Book(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}
