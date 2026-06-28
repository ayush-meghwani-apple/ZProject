import { getPrefs } from './preferences';

/**
 * Sound cues. The "success" cue plays a real audio clip (public/faaah.mp3);
 * the rest are tiny synthesized Web Audio tones. Everything works offline (the
 * mp3 is precached by the service worker) and respects the user's sound setting.
 */
export type SoundKind = 'success' | 'note' | 'uncategorized';

interface Tone {
  freq: number;
  start: number; // seconds from now
  dur: number; // seconds
}

// Synthesized fallbacks for the non-success cues.
const PATTERNS: Record<'note' | 'uncategorized', Tone[]> = {
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

// The "faaah" success clip. Served from the app's base path (e.g.
// /ZProject/expense-tracker/faaah.mp3 on GitHub Pages) and precached for offline.
let successClip: HTMLAudioElement | null = null;

function playSuccessClip(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  try {
    if (!successClip) {
      successClip = new Audio(`${import.meta.env.BASE_URL}faaah.mp3`);
      successClip.preload = 'auto';
      successClip.volume = 0.7;
    }
    // Rewind so rapid successive adds always retrigger from the start.
    successClip.currentTime = 0;
    void successClip.play().catch(() => {
      /* Autoplay can be blocked outside a user gesture — fine to ignore. */
    });
  } catch {
    /* ignore */
  }
}

function playTones(kind: 'note' | 'uncategorized'): void {
  const ac = audio();
  if (!ac) return;
  // Must be resumed from a user gesture (we call this on chat submit / taps).
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

export function playSound(kind: SoundKind): void {
  if (!getPrefs().soundEnabled) return;
  if (kind === 'success') {
    playSuccessClip();
    return;
  }
  playTones(kind);
}

