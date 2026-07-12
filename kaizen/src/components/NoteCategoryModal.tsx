import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { NoteCategory } from '../types/models';

// A small set of handy icons; the text field also accepts any emoji you paste.
const EMOJIS = [
  '🗂️', '📁', '💼', '🏠', '🎯', '💡', '📚', '🧾', '🩺', '✈️',
  '🍳', '🏋️', '🎨', '🎵', '💰', '📌', '⭐', '❤️', '🌱', '🔖',
];

interface Props {
  initial: NoteCategory | null;
  onSave: (data: { name: string; emoji: string }) => void;
  onClose: () => void;
}

/** Small sheet to create or edit a note category (name + emoji). */
export default function NoteCategoryModal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🗂️');

  function save() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), emoji });
  }

  return createPortal(
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? 'Edit category' : 'New category'}</h3>

        <label className="field">
          <span>Name</span>
          <input
            className="input"
            value={name}
            autoFocus
            placeholder="e.g. Work, Recipes, Travel"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </label>

        <div className="field">
          <span>Icon</span>
          <div className="emojigrid">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`emojigrid__it${emoji === e ? ' emojigrid__it--on' : ''}`}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
