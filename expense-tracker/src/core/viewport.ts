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

  function apply() {
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    // When the on-screen keyboard covers a big chunk of the layout viewport,
    // flag it so the UI can hide the bottom tab bar (Apple-Notes style) and let
    // only the editor toolbar sit right above the keyboard.
    const covered = window.innerHeight - height;
    const kbOpen = covered > 120;
    root.style.setProperty('--app-height', `${Math.round(height)}px`);
    // Only honour a non-zero offset while the keyboard is actually open. Without
    // this, iOS transiently scrolls to a focused element (e.g. a tapped chart
    // SVG) and reports a small offsetTop, which would shift the fixed app down
    // and push the bottom tab bar off-screen.
    root.style.setProperty('--app-top', `${kbOpen ? Math.round(top) : 0}px`);
    root.classList.toggle('kb-open', kbOpen);
  }

  apply();

  // The keyboard animates open/closed over a few hundred ms, and iOS sometimes
  // fires only an intermediate `resize` — leaving `--app-height` stuck at a
  // half-open value (a dead gap between the field and the keyboard that only a
  // restart cleared). Re-sampling a few times after a trigger catches the
  // settled height and self-heals that stuck state.
  let resyncTimers: number[] = [];
  function resync() {
    resyncTimers.forEach((t) => window.clearTimeout(t));
    apply();
    resyncTimers = [60, 160, 320, 550].map((d) => window.setTimeout(apply, d));
  }

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', resync);

  // Belt-and-suspenders for hiding the bottom tab bar while typing: some setups
  // (and some iOS timing) don't shrink visualViewport reliably, so also flag
  // whenever an editable element is focused. CSS hides the tab bar on
  // `.kb-open` OR `.kb-typing` (the latter gated to touch devices).
  function isEditable(el: EventTarget | null): boolean {
    const n = el as HTMLElement | null;
    if (!n) return false;
    const tag = n.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable;
  }
  document.addEventListener('focusin', (e) => {
    root.classList.toggle('kb-typing', isEditable(e.target));
    if (isEditable(e.target)) resync();
  });
  document.addEventListener('focusout', () => {
    // Wait a tick so we read the element that actually ends up focused.
    setTimeout(() => root.classList.toggle('kb-typing', isEditable(document.activeElement)), 0);
    resync();
  });
}
