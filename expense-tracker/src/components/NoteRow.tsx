import { useRef, useState } from 'react';
import { blocksToHtml, htmlToPreview } from '../core/noteHtml';
import { formatDate } from '../core/util';
import AppIcon from './AppIcon';
import type { ID, NoteCategory, NoteDoc } from '../types/models';

interface Props {
  doc: NoteDoc;
  categories: NoteCategory[];
  onOpen: () => void;
  onDelete: () => void;
  onMove: (categoryId: ID | undefined) => void;
  onTogglePin: () => void;
}

const DEL_W = 96; // revealed width when swiping right (delete)
const ACT_W = 168; // revealed width when swiping left (pin + move)

/**
 * A single note on the home list with mail-style swipe actions: swipe right to
 * reveal Delete, swipe left to reveal Pin + Move. Tapping the card opens it.
 */
export default function NoteRow({ doc, categories, onOpen, onDelete, onMove, onTogglePin }: Props) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<'del' | 'act' | null>(null);
  const [moveMenu, setMoveMenu] = useState(false);
  const start = useRef(0);
  const base = useRef(0);
  const moved = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = e.clientX;
    base.current = offset;
    moved.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!(e.buttons & 1) && e.pointerType === 'mouse') return;
    const dx = e.clientX - start.current;
    if (Math.abs(dx) > 5) moved.current = true;
    if (!moved.current) return;
    let x = base.current + dx;
    x = Math.max(-ACT_W, Math.min(DEL_W, x));
    setOffset(x);
  }

  function onPointerUp() {
    if (!moved.current) {
      // A tap: close if a panel is open, otherwise open the note.
      if (open) {
        setOffset(0);
        setOpen(null);
        setMoveMenu(false);
      } else {
        onOpen();
      }
      return;
    }
    if (offset > DEL_W / 2) {
      setOffset(DEL_W);
      setOpen('del');
    } else if (offset < -ACT_W / 2) {
      setOffset(-ACT_W);
      setOpen('act');
    } else {
      setOffset(0);
      setOpen(null);
      setMoveMenu(false);
    }
  }

  function close() {
    setOffset(0);
    setOpen(null);
    setMoveMenu(false);
  }

  const preview = htmlToPreview(doc.body ?? blocksToHtml(doc.blocks ?? []));

  return (
    <div className="noterow" data-noswipe>
      <div className="noterow__clip">
        <div className="noterow__act noterow__act--del">
          <button
            onClick={() => {
              onDelete();
              close();
            }}
          >
            <AppIcon name="trash" size={18} />
            <span>Delete</span>
          </button>
        </div>

        <div className="noterow__act noterow__act--right">
          <button
            className="noterow__pin"
            onClick={() => {
              onTogglePin();
              close();
            }}
          >
            <AppIcon name="pin" size={18} />
            <span>{doc.pinned ? 'Unpin' : 'Pin'}</span>
          </button>
          <button className="noterow__move" onClick={() => setMoveMenu((v) => !v)}>
            <AppIcon name="folder" size={18} />
            <span>Move</span>
          </button>
        </div>

        <div
          className="noterow__card"
          style={{ transform: `translateX(${offset}px)`, transition: offset === 0 || open ? 'transform 0.2s ease' : 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="card notecard">
            {doc.pinned && <span className="notecard__pin"><AppIcon name="pin" size={13} /></span>}
            <div className="notecard__title">{doc.title.trim() || 'Untitled note'}</div>
            <div className="notecard__preview">{preview}</div>
            <div className="notecard__date">{formatDate(doc.updatedAt)}</div>
          </div>
        </div>
      </div>

      {moveMenu && (
        <div className="noterow__movemenu">
          {doc.categoryId && (
            <button onClick={() => { onMove(undefined); close(); }}>🗒️ General</button>
          )}
          {categories
            .filter((c) => c.id !== doc.categoryId)
            .map((c) => (
              <button key={c.id} onClick={() => { onMove(c.id); close(); }}>
                <span>{c.emoji}</span> {c.name}
              </button>
            ))}
          {categories.filter((c) => c.id !== doc.categoryId).length === 0 && !doc.categoryId && (
            <button disabled>No other categories</button>
          )}
        </div>
      )}
    </div>
  );
}
