import { newId, now } from '../core/util';

/**
 * A free-text note/reminder typed in chat without an amount. Kept out of the
 * expense database (it isn't money) but surfaced in the Reels feed so it stays
 * part of the normal review flow. Stored in localStorage to keep it simple.
 */
export interface Note {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

const KEY = 'expense:notes';

function read(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    return [];
  }
}

function write(notes: Note[]): void {
  try {
    // Cap so storage can't grow without bound.
    localStorage.setItem(KEY, JSON.stringify(notes.slice(0, 200)));
  } catch {
    /* ignore unavailable storage */
  }
}

export const NotesRepository = {
  getAll(): Note[] {
    return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getActive(): Note[] {
    return this.getAll().filter((n) => !n.done);
  },

  add(text: string): Note {
    const note: Note = { id: newId(), text: text.trim(), done: false, createdAt: now() };
    write([note, ...read()]);
    return note;
  },

  setDone(id: string, done: boolean): void {
    write(read().map((n) => (n.id === id ? { ...n, done } : n)));
  },

  remove(id: string): void {
    write(read().filter((n) => n.id !== id));
  },
};
