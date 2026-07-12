import type { NoteBlock } from '../types/models';

/** Escape text for safe insertion into HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Add a scheme if the user typed a bare domain. */
export function normalizeUrl(url: string): string {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Convert the legacy block format (pre-1.6.1) into HTML for the new editor. */
export function blocksToHtml(blocks: NoteBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'text') return `<p>${escapeHtml(b.text ?? '').replace(/\n/g, '<br>')}</p>`;
      if (b.type === 'bullets') {
        const items = (b.text ?? '')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join('');
        return items ? `<ul>${items}</ul>` : '';
      }
      if (b.type === 'image' && b.dataUrl) return `<p><img src="${b.dataUrl}"></p>`;
      if (b.type === 'link' && b.url)
        return `<p><a href="${escapeHtml(normalizeUrl(b.url))}">${escapeHtml(b.url)}</a></p>`;
      return '';
    })
    .join('');
}

/** Strip anything unsafe from user/pasted HTML before it's stored. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, iframe, object, embed, link, meta').forEach((el) =>
    el.remove(),
  );
  doc.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML;
}

/** True when an HTML body has no text, images or tables. */
export function isHtmlEmpty(html: string): boolean {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  if (tmp.querySelector('img, table')) return false;
  return (tmp.textContent ?? '').replace(/\u00a0/g, ' ').trim().length === 0;
}

/** A short, plain-text preview of an HTML body for the notes list. */
export function htmlToPreview(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  if (tmp.querySelector('table')) return '▦ Table';
  if (tmp.querySelector('img')) return '🖼️ Image';
  return 'Empty note';
}
