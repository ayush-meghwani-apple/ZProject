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
    root.style.setProperty('--app-height', `${Math.round(height)}px`);
    root.style.setProperty('--app-top', `${Math.round(top)}px`);
    // When the on-screen keyboard covers a big chunk of the layout viewport,
    // flag it so the UI can hide the bottom tab bar (Apple-Notes style) and let
    // only the editor toolbar sit right above the keyboard.
    const covered = window.innerHeight - height;
    root.classList.toggle('kb-open', covered > 120);
  }

  apply();

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);

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
  });
  document.addEventListener('focusout', () => {
    // Wait a tick so we read the element that actually ends up focused.
    setTimeout(() => root.classList.toggle('kb-typing', isEditable(document.activeElement)), 0);
  });
}
