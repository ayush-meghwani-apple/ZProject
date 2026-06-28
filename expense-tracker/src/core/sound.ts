import { getPrefs } from './preferences';

/**
 * Tiny synthesized sound cues (Web Audio) — no audio files, so nothing is added
 * to the bundle and it works fully offline. Respects the user's sound setting.
 */
export type SoundKind = 'success' | 'note' | 'uncategorized';

interface Tone {
  freq: number;
  start: number; // seconds from now
  dur: number; // seconds
}

const PATTERNS: Record<SoundKind, Tone[]> = {
  // Happy rising two-note chime for a clean, categorized expense.
  success: [
    { freq: 659.25, start: 0, dur: 0.12 },
    { freq: 987.77, start: 0.1, dur: 0.18 },
  ],
  // Soft single blip for a saved note.
  note: [{ freq: 523.25, start: 0, dur: 0.18 }],
  // Neutral falling two-note for an expense with no matching category.
  uncategorized: [
    { freq: 440, start: 0, dur: 0.12 },
    { freq: 329.63, start: 0.11, dur: 0.18 },
  ],
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = ctx ?? new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function playSound(kind: SoundKind): void {
  if (!getPrefs().soundEnabled) return;
  const ac = audio();
  if (!ac) return;
  // Must be resumed from a user gesture (we call this on chat submit).
  if (ac.state === 'suspended') void ac.resume();

  const t0 = ac.currentTime;
  for (const tone of PATTERNS[kind]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = tone.freq;
    const start = t0 + tone.start;
    const end = start + tone.dur;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
