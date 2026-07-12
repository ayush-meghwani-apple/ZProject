/**
 * Hide the iOS Safari keyboard's top accessory bar (the up/down "prev/next
 * field" arrows + Done button) inside the PWA.
 *
 * iOS shows those form-navigation arrows whenever it detects more than one
 * focusable form field on the page. The well-known workaround is to make every
 * *other* field `readonly` while one is focused, so iOS thinks there's only a
 * single field and drops the prev/next arrows.
 *
 * The catch: a `readonly` field won't bring up the keyboard when tapped. So we
 * clear the readonly flags on `pointerdown`/`touchstart` (which fire *before*
 * focus) — that way tapping straight from one field to another still works — and
 * re-apply them once focus lands. On blur we clear everything again.
 *
 * Only real form controls are touched (`input`, `textarea`, `select`); the
 * contentEditable note body is never modified.
 */

const FIELD_SELECTOR = 'input, textarea, select';

/** Skip fields that are already meant to be read-only / disabled, so we can
 *  restore the exact original state instead of blindly stripping the flag. */
function isEditableField(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    (el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement) &&
    !el.disabled
  );
}

export function initIosKeyboard(): void {
  // Only iOS Safari/WebKit shows this accessory bar; skip elsewhere so we never
  // toggle readonly on other platforms.
  const isIOS =
    /iP(hone|ad|od)/.test(navigator.platform) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isIOS) return;

  // Fields we (temporarily) marked readonly, so we only ever clear our own flag
  // and leave intentionally-readonly fields alone.
  const marked = new Set<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();

  function clearMarks() {
    marked.forEach((el) => el.removeAttribute('readonly'));
    marked.clear();
  }

  function markOthers(active: Element | null) {
    document.querySelectorAll<HTMLElement>(FIELD_SELECTOR).forEach((el) => {
      if (el === active || !isEditableField(el)) return;
      // Don't clobber a field that is genuinely readonly on its own.
      if (el.hasAttribute('readonly')) return;
      el.setAttribute('readonly', 'readonly');
      marked.add(el);
    });
  }

  // Before focus moves (tap/click), unmask ONLY the field about to be focused, so
  // it can take focus and raise the keyboard — while every other field stays
  // readonly. Clearing them all here caused a race where, for a split second, all
  // fields were editable at focus time and iOS drew the prev/next arrows anyway.
  const onDown = (e: Event) => {
    const t = e.target as Element | null;
    if (!t) return;
    const field = t.closest?.(FIELD_SELECTOR) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null;
    if (field && marked.has(field)) {
      field.removeAttribute('readonly');
      marked.delete(field);
    }
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('touchstart', onDown, true);

  document.addEventListener('focusin', (e) => {
    const t = e.target as Element | null;
    if (!t) return;
    const field = isEditableField(t);
    const editable = t instanceof HTMLElement && t.isContentEditable;
    // Focusing a form field OR the rich-text note body should still collapse the
    // page to a single apparent input, so mask every other real form control.
    if (field || editable) markOthers(field ? t : null);
  });

  document.addEventListener('focusout', () => {
    // Defer so a focus that immediately follows (field-to-field, or field-to-note
    // body) re-marks first. Keep the masks while any input or the rich-text body
    // still holds focus; only clear once nothing editable is focused.
    setTimeout(() => {
      const active = document.activeElement;
      const keep =
        !!active &&
        (isEditableField(active) || (active instanceof HTMLElement && active.isContentEditable));
      if (!keep) clearMarks();
    }, 0);
  });
}
