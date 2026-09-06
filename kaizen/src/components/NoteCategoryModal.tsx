import { useState } from 'react';
import type { NoteCategory } from '../types/models';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Sheet from './ui/Sheet';

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

  return (
    <Sheet
      title={initial ? 'Edit category' : 'New category'}
      onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </>
      )}
    >
        <FormField label="Name">
          <input
            className="input"
            value={name}
            autoFocus
            placeholder="e.g. Work, Recipes, Travel"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </FormField>

        <div className="field ui-field">
          <span className="ui-field__label">Icon</span>
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
    </Sheet>
  );
}
