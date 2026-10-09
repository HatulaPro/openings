// Downloads the move sounds the app plays into public/sound.
//
// They are the "standard" sounds of Lichess. Lila's COPYING.md lists them
// among its non-free exceptions, with no licence stated, so they are fetched
// for personal use and kept out of this repository.
//
//   pnpm data:sounds

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/';
const FILES = ['Move.mp3', 'Capture.mp3'];

const dir = fileURLToPath(new URL('../public/sound/', import.meta.url));
mkdirSync(dir, { recursive: true });
for (const file of FILES) {
  const response = await fetch(BASE + file);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(dir + file, bytes);
  console.log(`${(bytes.length / 1024).toFixed(1).padStart(6)} kB  public/sound/${file}`);
}
