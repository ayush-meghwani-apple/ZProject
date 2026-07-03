import { useEffect, useState } from 'react';
import { NoteDocRepository } from '../repository/noteDocRepository';
import { blocksToHtml, htmlToPreview } from '../core/noteHtml';
import { formatDate } from '../core/util';
import NoteEditor from './NoteEditor';
import type { NoteDoc } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

function previewOf(doc: NoteDoc): string {
  return htmlToPreview(doc.body ?? blocksToHtml(doc.blocks ?? []));
}

export default function Notes({ version, onChange }: Props) {
  const [docs, setDocs] = useState<NoteDoc[]>([]);
  const [openDoc, setOpenDoc] = useState<NoteDoc | null>(null);

  async function load() {
    setDocs(await NoteDocRepository.getAll());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  async function startNew() {
    const doc = await NoteDocRepository.add({ title: '', body: '' });
    setOpenDoc(doc);
  }

  async function exitEditor() {
    setOpenDoc(null);
    await load();
    onChange();
  }

  if (openDoc) {
    return <NoteEditor key={openDoc.id} doc={openDoc} onExit={exitEditor} />;
  }

  return (
    <div className="page">
      <button className="btn" style={{ width: '100%' }} onClick={startNew}>
        ➕ New Note
      </button>

      {docs.length === 0 && (
        <div className="empty">No notes yet. Create one to jot things down.</div>
      )}

      {docs.map((doc) => (
        <button className="card notecard" key={doc.id} onClick={() => setOpenDoc(doc)}>
          <div className="notecard__title">{doc.title.trim() || 'Untitled note'}</div>
          <div className="notecard__preview">{previewOf(doc)}</div>
          <div className="notecard__date">{formatDate(doc.updatedAt)}</div>
        </button>
      ))}
    </div>
  );
}
