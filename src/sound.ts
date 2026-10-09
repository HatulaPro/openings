// The sound of a piece landing. Synthesised, so the app carries no audio files
// and works offline. Without Web Audio the board is simply silent.

export type MoveSound = 'move' | 'capture' | 'check';

let ctx: AudioContext | undefined;
let noise: AudioBuffer | undefined;

function context(): AudioContext | undefined {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return undefined;
  }
}

// A context made before the first touch starts suspended, so each touch wakes it.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => void context()?.resume().catch(() => {}), { capture: true, passive: true });
}

/** One piece hitting the board: a click of filtered noise over a short low thump. */
function knock(audio: AudioContext, at: number, pitch: number, volume: number): void {
  if (!noise) {
    noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.1), audio.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }

  const click = audio.createBufferSource();
  click.buffer = noise;
  const band = audio.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = pitch;
  band.Q.value = 1.4;
  const clickGain = audio.createGain();
  clickGain.gain.setValueAtTime(volume, at);
  clickGain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  click.connect(band).connect(clickGain).connect(audio.destination);
  click.start(at);
  click.stop(at + 0.06);

  const thump = audio.createOscillator();
  thump.frequency.setValueAtTime(pitch / 6, at);
  thump.frequency.exponentialRampToValueAtTime(pitch / 12, at + 0.07);
  const thumpGain = audio.createGain();
  thumpGain.gain.setValueAtTime(volume * 0.8, at);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
  thump.connect(thumpGain).connect(audio.destination);
  thump.start(at);
  thump.stop(at + 0.09);
}

/** A short high note after the knock, for a check. */
function ping(audio: AudioContext, at: number): void {
  const tone = audio.createOscillator();
  tone.type = 'triangle';
  tone.frequency.value = 1320;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.12, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
  tone.connect(gain).connect(audio.destination);
  tone.start(at);
  tone.stop(at + 0.15);
}

export function playMoveSound(sound: MoveSound): void {
  const audio = context();
  // Scheduling on a suspended context would play the sound late, at the next touch.
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  if (sound === 'capture') {
    // The taken piece is knocked aside just before the other lands.
    knock(audio, now, 1900, 0.45);
    knock(audio, now + 0.045, 1300, 0.6);
    return;
  }
  knock(audio, now, 1200, 0.5);
  if (sound === 'check') ping(audio, now + 0.03);
}
