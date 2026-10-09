// Binary layout of public/book.bin, shared by the build script and the app.
//
//   bytes 0..3    magic "OBK1"
//   bytes 4..7    uint32  position count N
//   bytes 8..11   uint32  games processed
//   bytes 12..15  uint32  minimum games per position
//   then          float64[N]  position keys, ascending
//   then          uint32[N]   white wins
//   then          uint32[N]   draws
//   then          uint32[N]   black wins
//
// Everything is little-endian, which is what typed arrays use on x86 and ARM.

export const BOOK_MAGIC = 0x314b424f; // "OBK1"
export const BOOK_HEADER_BYTES = 16;

export interface BookData {
  games: number;
  minGames: number;
  keys: Float64Array;
  white: Uint32Array;
  draws: Uint32Array;
  black: Uint32Array;
}

export function encodeBook(data: BookData): Uint8Array {
  const n = data.keys.length;
  const buf = new ArrayBuffer(BOOK_HEADER_BYTES + n * 20);
  const header = new Uint32Array(buf, 0, 4);
  header[0] = BOOK_MAGIC;
  header[1] = n;
  header[2] = data.games;
  header[3] = data.minGames;
  let offset = BOOK_HEADER_BYTES;
  new Float64Array(buf, offset, n).set(data.keys);
  offset += n * 8;
  new Uint32Array(buf, offset, n).set(data.white);
  offset += n * 4;
  new Uint32Array(buf, offset, n).set(data.draws);
  offset += n * 4;
  new Uint32Array(buf, offset, n).set(data.black);
  return new Uint8Array(buf);
}

export function decodeBook(buf: ArrayBuffer): BookData {
  const header = new Uint32Array(buf, 0, 4);
  if (header[0] !== BOOK_MAGIC) throw new Error('book.bin: bad magic');
  const n = header[1]!;
  if (buf.byteLength !== BOOK_HEADER_BYTES + n * 20) throw new Error('book.bin: truncated');
  let offset = BOOK_HEADER_BYTES;
  const keys = new Float64Array(buf, offset, n);
  offset += n * 8;
  const white = new Uint32Array(buf, offset, n);
  offset += n * 4;
  const draws = new Uint32Array(buf, offset, n);
  offset += n * 4;
  const black = new Uint32Array(buf, offset, n);
  return { games: header[2]!, minGames: header[3]!, keys, white, draws, black };
}
