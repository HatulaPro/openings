// Downloads the Stockfish build the app runs on the device into public/engine.
//
// It is the single-threaded "lite" flavour of stockfish.js (the npm package
// `stockfish`): under 2 MB, and it needs no cross-origin isolation, which
// Android's WebView cannot provide. The whole package is over 200 MB because
// it also carries the full network twice, so only these files are fetched.
//
//   pnpm data:engine

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VERSION = '19.0.0';
const BASE = `https://unpkg.com/stockfish@${VERSION}/`;
const FILES = [
  { from: 'bin/stockfish-19-lite-single.js', to: 'stockfish-19-lite-single.js' },
  { from: 'bin/stockfish-19-lite-single.wasm', to: 'stockfish-19-lite-single.wasm' },
  // Stockfish is GPLv3; its licence travels with the binaries.
  { from: 'Copying.txt', to: 'Copying.txt' },
];

const dir = fileURLToPath(new URL('../public/engine/', import.meta.url));
mkdirSync(dir, { recursive: true });
for (const file of FILES) {
  const response = await fetch(BASE + file.from);
  if (!response.ok) throw new Error(`${file.from}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(dir + file.to, bytes);
  console.log(`${(bytes.length / 1024).toFixed(0).padStart(6)} kB  public/engine/${file.to}`);
}
