// The sound of a piece landing: the recordings Lichess plays, fetched into
// public/sound by `pnpm data:sounds`. Without them, or without Web Audio, the
// board is simply silent.

export type MoveSound = 'move' | 'capture';

const FILES: Record<MoveSound, string> = { move: 'Move.mp3', capture: 'Capture.mp3' };

let ctx: AudioContext | undefined;
const buffers = new Map<MoveSound, AudioBuffer>();

async function load(audio: AudioContext, sound: MoveSound): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}sound/${FILES[sound]}`);
    if (response.ok) buffers.set(sound, await audio.decodeAudioData(await response.arrayBuffer()));
  } catch {
    // Not being heard is the only consequence.
  }
}

function context(): AudioContext | undefined {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return undefined;
  }
  for (const sound of Object.keys(FILES) as MoveSound[]) void load(ctx, sound);
  return ctx;
}

// A context made before the first touch starts suspended, so each touch wakes it.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => void context()?.resume().catch(() => {}), { capture: true, passive: true });
}

export function playMoveSound(sound: MoveSound): void {
  const audio = context();
  const buffer = buffers.get(sound);
  // Starting on a suspended context would play the sound late, at the next touch.
  if (!audio || !buffer || audio.state !== 'running') return;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.start();
}
