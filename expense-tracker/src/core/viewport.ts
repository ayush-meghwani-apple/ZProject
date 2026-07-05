/**
 * Bind the app box to the *visual* viewport so it always fills exactly the
 * visible area and its bottom edge sits right above the on-screen keyboard.
 *
 * CSS alone can't do this reliably: iOS Safari does NOT support the
 * `interactive-widget` viewport hint, and it keeps `position: fixed` pinned
 * behind the keyboard. `window.visualViewport` reports the true visible box, so
 * we mirror its height + offset into CSS variables that `.app` consumes.
 */
export function initViewport(): void {
  const root = document.documentElement;

  function isEditable(el: EventTarget | null): boolean {
    const n = el as HTMLElement | null;
    if (!n) return false;
    const tag = n.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable;
  }

  function apply() {
    const vv = window.visualViewport;
    const vvh = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    // The on-screen keyboard can ONLY be up when an editable field is focused.
    // Gating on that is critical: at a cold PWA start (or when resuming from the
    // background) iOS can briefly report a short `visualViewport.height` even
    // though no keyboard is open. Without this gate the app treated that as
    // "keyboard open", shrank its box, and the input/toolbar ended up floating
    // in the middle of the screen instead of pinned to the bottom.
    const editableFocused = isEditable(document.activeElement);
    const covered = window.innerHeight - vvh;
    const kbOpen = editableFocused && covered > 120;
    // Keyboard closed → size to the stable layout viewport (`innerHeight`), not
    // `visualViewport.height` which can be transiently wrong on start/resume.
    // Keyboard open → size to the visible area so the bottom sits above it.
    const height = kbOpen ? vvh : window.innerHeight;
    root.style.setProperty('--app-height', `${Math.round(height)}px`);
    // Only honour a non-zero offset while the keyboard is actually open. Without
    // this, iOS transiently scrolls to a focused element (e.g. a tapped chart
    // SVG) and reports a small offsetTop, which would shift the fixed app down
    // and push the bottom tab bar off-screen.
    root.style.setProperty('--app-top', `${kbOpen ? Math.round(top) : 0}px`);
    const wasKbOpen = root.classList.contains('kb-open');
    root.classList.toggle('kb-open', kbOpen);
    // The moment the keyboard actually opens (and `.kb-open` padding kicks in),
    // dock the focused field just above it.
    if (kbOpen && !wasKbOpen) startDocking();
  }

  // The keyboard animates open/closed over a few hundred ms, and iOS sometimes
  // fires only an intermediate `resize` — or none at all on a cold start /
  // resume — leaving the CSS vars stuck at a wrong value (a dead gap, or the
  // input/toolbar floating). Re-sampling a few times after a trigger catches the
  // settled height and self-heals that stuck state.
  let resyncTimers: number[] = [];
  function resync() {
    resyncTimers.forEach((t) => window.clearTimeout(t));
    apply();
    resyncTimers = [60, 160, 320, 550, 850, 1200].map((d) => window.setTimeout(apply, d));
  }

  // Dock a focused *form field* just above the keyboard — deterministically.
  //
  // When the keyboard opens, iOS/Blink run their own scroll-into-view which
  // *over-scrolls* the field toward the middle of the now-shrunken viewport,
  // leaving a big empty gap between the field and the keyboard (the reported
  // "whole thing scrolls up / blank area"). Nudging only when the field is
  // clipped never fixed that, because an over-scrolled field isn't clipped — it
  // just floats too high.
  //
  // So we compute the exact scroll that puts the field's bottom a small margin
  // above the scroll container's bottom (which sits right at the keyboard) and
  // set it directly. A positive delta scrolls up (field was behind the
  // keyboard); a negative delta scrolls down (field was floating too high).
  // `scrollTop` clamps to the valid range, so a field near the very top simply
  // stays there instead of forcing blank space above it. Chat and the note
  // editor own their layout, so fields outside a `.page` are skipped.
  function dockFocused() {
    if (!root.classList.contains('kb-open')) return;
    const el = document.activeElement as HTMLElement | null;
    if (!el) return;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
    if (!el.closest('.page')) return;
    const sc = el.closest('.app__body') as HTMLElement | null;
    if (!sc) return;
    const scRect = sc.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const gap = 24; // rest the field this far above the keyboard
    const delta = elRect.bottom - (scRect.bottom - gap);
    if (Math.abs(delta) > 2) sc.scrollTop += delta;
  }

  // The keyboard opens over a few hundred ms and the viewport settles in stages,
  // while the browser's own scroll-into-view fires in between — so re-assert our
  // deterministic position a few times to override it and land the field.
  function startDocking() {
    [0, 90, 200, 350, 550, 800].forEach((d) => window.setTimeout(dockFocused, d));
  }

  apply();
  // Cold-start viewport can be wrong for a moment — re-sample after first paint
  // and once everything has loaded.
  resync();
  window.addEventListener('load', resync);

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', resync);
  // Resuming a backgrounded PWA is the main source of the intermittent bad
  // layout ("2–3 times out of 5 opens") — re-measure when we return to the
  // foreground, since iOS may have restored a stale visual viewport.
  window.addEventListener('pageshow', resync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resync();
  });

  // Belt-and-suspenders for hiding the bottom tab bar while typing: some setups
  // (and some iOS timing) don't shrink visualViewport reliably, so also flag
  // whenever an editable element is focused. CSS hides the tab bar on
  // `.kb-open` OR `.kb-typing` (the latter gated to touch devices).
  document.addEventListener('focusin', (e) => {
    root.classList.toggle('kb-typing', isEditable(e.target));
    if (isEditable(e.target)) {
      resync();
      // Dock the field above the keyboard once it (and the shrunk viewport) have
      // settled; the loop keeps correcting for ~900ms so native scroll-into-view
      // doesn't leave it stranded.
      startDocking();
    }
  });
  document.addEventListener('focusout', () => {
    // Wait a tick so we read the element that actually ends up focused.
    setTimeout(() => root.classList.toggle('kb-typing', isEditable(document.activeElement)), 0);
    resync();
  });
}
