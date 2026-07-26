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

  // Is the app running as an installed Home-Screen PWA (no browser chrome)? In
  // that mode `100dvh` reliably fills the screen, so we can avoid the visual-
  // viewport under-reporting that leaves a gap below the tab bar.
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  // The largest visible height we've seen for the current orientation — i.e. the
  // viewport height with NO keyboard. We compare the live height against THIS
  // (not `window.innerHeight`, which on some iOS versions ALSO shrinks when the
  // keyboard opens — which would make the keyboard undetectable).
  let maxVH = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  // Which focusable elements actually pop the on-screen TEXT keyboard. A
  // `<select>` and the date/time/color/etc. inputs open an overlay wheel/picker,
  // NOT a keyboard — but they still fire focusin/focusout. Treating them as
  // "keyboard open" made the global header + bottom tab bar hide (and the whole
  // app jump vertically) every time a dropdown or date field was tapped, so they
  // are excluded here. Only real text entry counts.
  const NON_KEYBOARD_INPUT_TYPES = new Set([
    'date', 'datetime-local', 'month', 'week', 'time', 'color', 'range',
    'checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'image',
  ]);
  function isEditable(el: EventTarget | null): boolean {
    const n = el as HTMLElement | null;
    if (!n) return false;
    if (n.isContentEditable) return true;
    const tag = n.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') return !NON_KEYBOARD_INPUT_TYPES.has(((n as HTMLInputElement).type || 'text').toLowerCase());
    return false; // <select> and everything else: no text keyboard
  }

  function apply() {
    const vv = window.visualViewport;
    const vvh = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    // Learn the no-keyboard height (the tallest visible height we've seen).
    if (vvh > maxVH) maxVH = vvh;
    // The on-screen keyboard can ONLY be up when an editable field is focused.
    // Gating on that is critical: at a cold PWA start (or when resuming from the
    // background) iOS can briefly report a short `visualViewport.height` even
    // though no keyboard is open.
    const editableFocused = isEditable(document.activeElement);
    // Measure the keyboard against the LEARNED full height, not innerHeight — on
    // some iOS versions innerHeight shrinks with the keyboard too, which would
    // make this read ~0 so the keyboard would never be detected.
    const covered = maxVH - vvh;
    const kbOpen = editableFocused && covered > 120;
    // Sizing the app box:
    //  • keyboard open → the visible area (px), so the bottom sits just above the
    //    keyboard;
    //  • keyboard closed, INSTALLED PWA (standalone) → `100dvh`. In standalone
    //    there is no browser chrome, so `dvh` reliably equals the full screen —
    //    unlike `visualViewport.height`, which iOS can under-report (leaving a
    //    dead gap below the tab bar). We can't use `dvh` in normal Safari because
    //    it ignores the toolbars and would hide the tab bar behind them.
    //  • keyboard closed, in-browser → the learned full visualViewport height.
    if (kbOpen) {
      root.style.setProperty('--app-height', `${Math.round(vvh)}px`);
    } else if (isStandalone) {
      root.style.setProperty('--app-height', '100dvh');
    } else {
      root.style.setProperty('--app-height', `${Math.round(maxVH)}px`);
    }
    // Only honour a non-zero offset while the keyboard is actually open.
    root.style.setProperty('--app-top', `${kbOpen ? Math.round(top) : 0}px`);
    const wasKbOpen = root.classList.contains('kb-open');
    root.classList.toggle('kb-open', kbOpen);
    // Self-heal the "typing" flag from the LIVE focus too. `kb-typing` is
    // normally toggled on focusin/focusout, but removing a focused field from
    // the DOM (e.g. deleting a row while its input is focused) fires NO focusout,
    // so `kb-typing` — and thus the hidden global header — could stay stuck until
    // an app restart. Re-deriving it here (this runs on the viewport resize that
    // fires when the keyboard closes) brings the header back on its own.
    if (!editableFocused) root.classList.remove('kb-typing');
    // The moment the keyboard actually opens, bring the focused field into view.
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

  // Bring the focused *form field* into view above the keyboard using the
  // browser's OWN native scroll-into-view — which iOS handles reliably — rather
  // than computing scroll positions ourselves (doing our own math fought iOS and
  // left gaps / lurches). `block: 'nearest'` never over-scrolls a field that's
  // already visible, and because `.app__body` carries `scroll-padding`, it lands
  // the field a small margin above the keyboard. Chat and the note editor own
  // their layout, so fields outside a `.page` are skipped.
  function dockFocused() {
    if (!root.classList.contains('kb-open')) return;
    const el = document.activeElement as HTMLElement | null;
    if (!el) return;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
    if (!el.closest('.page')) return;
    try {
      el.scrollIntoView({ block: 'nearest' });
    } catch {
      /* very old browsers — ignore */
    }
  }

  // The keyboard opens over a few hundred ms and the viewport settles in stages,
  // so re-assert the field's position a few times as it settles.
  function startDocking() {
    [0, 120, 300, 550, 800].forEach((d) => window.setTimeout(dockFocused, d));
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
  window.addEventListener('orientationchange', () => {
    // Re-learn the full height for the new orientation.
    maxVH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    resync();
  });
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

  // Optional on-screen diagnostics: open the app with `?kbdebug=1` (or add
  // `#kbdebug` to the URL), OR set the `kaizen.kbdebug` localStorage flag (which
  // the Settings → About version toggles on 5 taps — the only way to reach this
  // inside an installed PWA, which has no address bar). Shows a live readout of
  // the viewport/layout metrics. No effect unless enabled.
  let debugOn = /kbdebug/i.test(location.search + location.hash);
  try {
    if (localStorage.getItem('kaizen.kbdebug') === '1') debugOn = true;
  } catch {
    /* ignore */
  }
  if (debugOn) initKbDebug();

  function initKbDebug() {
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;top:0;left:0;z-index:2147483647;background:rgba(0,0,0,.82);' +
      'color:#0f0;font:11px/1.35 monospace;padding:5px 7px;white-space:pre;' +
      'pointer-events:none;border-bottom-right-radius:8px;max-width:100vw;';
    // A hidden probe whose padding resolves the REAL safe-area inset pixels
    // (reading the CSS var directly only returns the literal `env(...)` string).
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
    const attach = () => {
      if (document.body) {
        document.body.appendChild(box);
        document.body.appendChild(probe);
      } else window.setTimeout(attach, 50);
    };
    attach();
    const upd = () => {
      const vv = window.visualViewport;
      const sc = document.querySelector('.app__body') as HTMLElement | null;
      const appEl = document.querySelector('.app') as HTMLElement | null;
      const tabEl = document.querySelector('.tabbar') as HTMLElement | null;
      const ae = document.activeElement as HTMLElement | null;
      const r = ae && ae.getBoundingClientRect ? ae.getBoundingClientRect() : null;
      const appR = appEl?.getBoundingClientRect();
      const tabR = tabEl?.getBoundingClientRect();
      const ps = getComputedStyle(probe);
      const saTop = ps.paddingTop;
      const saBot = ps.paddingBottom;
      const winH = window.innerHeight;
      const gapBelowTab = tabR ? Math.round(winH - tabR.bottom) : '-';
      const gapAppBottom = appR ? Math.round(winH - appR.bottom) : '-';
      box.textContent =
        `standalone=${isStandalone}  screen=${window.screen?.height ?? '-'}  win=${winH}  vvH=${vv ? Math.round(vv.height) : '-'}  maxVH=${Math.round(maxVH)}\n` +
        `safeArea top=${saTop} bot=${saBot}\n` +
        `appH=${getComputedStyle(root).getPropertyValue('--app-height').trim()}  appTop=${getComputedStyle(root).getPropertyValue('--app-top').trim()}\n` +
        `app: ${appR ? `${Math.round(appR.top)}\u2192${Math.round(appR.bottom)}` : '-'}  gapBelowApp=${gapAppBottom}\n` +
        `tabbar: ${tabR ? `${Math.round(tabR.top)}\u2192${Math.round(tabR.bottom)}` : '-'}  gapBelowTabbar=${gapBelowTab}\n` +
        (sc ? `body: ${Math.round(sc.getBoundingClientRect().bottom)}bot  scroll=${Math.round(sc.scrollTop)}/${sc.scrollHeight}  clientH=${sc.clientHeight}\n` : '') +
        `kbOpen=${root.classList.contains('kb-open')}  focus=${ae ? ae.tagName : '-'}${r ? `  top=${Math.round(r.top)} bot=${Math.round(r.bottom)}` : ''}`;
    };
    upd();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', upd);
      vv.addEventListener('scroll', upd);
    }
    window.addEventListener('resize', upd);
    document.addEventListener('focusin', upd);
    document.addEventListener('focusout', () => window.setTimeout(upd, 50));
    document.addEventListener('scroll', upd, true);
    window.setInterval(upd, 250);
  }
}
