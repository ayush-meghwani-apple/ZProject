import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: string;
  icon: ReactNode;
  render: () => ReactNode;
}

interface Props {
  tabs: TabDef[];
  /** Optional id to open on first mount; defaults to the first tab. */
  initialId?: string;
  /** Externally-driven tab open: bump `nonce` to switch to `id`. */
  controlledOpen?: { id: string; nonce: number };
}

/**
 * Reusable tabbed surface shared by every sub-app: renders the active view in
 * a swipeable body with a directional slide transition, plus the bottom tab
 * bar. Each sub-app just hands it a list of tabs with render functions.
 */
export default function TabbedApp({ tabs, initialId, controlledOpen }: Props) {
  const [activeId, setActiveId] = useState<string>(initialId ?? tabs[0].id);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dirLock = useRef<'h' | 'v' | null>(null);
  const noSwipe = useRef(false);
  const [swipeX, setSwipeX] = useState(0);
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next');
  // Don't play the directional slide on the very first render — otherwise a
  // whole sub-app mounting (e.g. switching apps) does a one-sided slide that
  // reads as a jerk. The slide is only for real tab changes after mount.
  const animate = useRef(false);
  useEffect(() => {
    animate.current = true;
  }, []);

  const tabIdx = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  );

  function goToTab(id: string) {
    const to = tabs.findIndex((t) => t.id === id);
    if (to < 0 || to === tabIdx) return;
    setSlideDir(to > tabIdx ? 'next' : 'prev');
    setActiveId(id);
  }

  // Respond to an externally-driven open request (e.g. the weekly review nudge
  // jumping to Reels).
  useEffect(() => {
    if (controlledOpen && controlledOpen.nonce > 0) goToTab(controlledOpen.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledOpen?.nonce]);

  const swipeTarget =
    swipeX < -20 && tabIdx < tabs.length - 1
      ? tabs[tabIdx + 1]
      : swipeX > 20 && tabIdx > 0
        ? tabs[tabIdx - 1]
        : null;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    dirLock.current = null;
    noSwipe.current = !!(e.target as HTMLElement).closest?.('[data-noswipe]');
    setSwipeX(0);
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = touchStart.current;
    if (!start || noSwipe.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Lock direction only once the gesture is clearly one way. Requiring the
    // horizontal move to strongly dominate (and a bigger initial threshold)
    // stops the view jittering sideways during ordinary vertical scrolls/taps.
    if (dirLock.current === null && Math.abs(dx) + Math.abs(dy) > 16) {
      dirLock.current = Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 12 ? 'h' : 'v';
    }
    if (dirLock.current === 'h') {
      // Ignore a small dead-zone so a settled horizontal drag doesn't twitch.
      const eff = dx - Math.sign(dx) * 12;
      const atEnd = (dx < 0 && tabIdx === tabs.length - 1) || (dx > 0 && tabIdx === 0);
      setSwipeX(atEnd ? eff * 0.25 : eff);
    }
  }

  function onTouchEnd() {
    const horizontal = dirLock.current === 'h' && !noSwipe.current;
    const dx = swipeX;
    touchStart.current = null;
    dirLock.current = null;
    noSwipe.current = false;
    setSwipeX(0);
    if (!horizontal || Math.abs(dx) < 60) return;
    if (dx < 0 && tabIdx < tabs.length - 1) goToTab(tabs[tabIdx + 1].id);
    else if (dx > 0 && tabIdx > 0) goToTab(tabs[tabIdx - 1].id);
  }

  const active = tabs[tabIdx];

  return (
    <>
      <main
        className="app__body"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {swipeTarget && (
          <div className={`swipe-hint swipe-hint--${swipeX < 0 ? 'next' : 'prev'}`}>
            {swipeX < 0 ? (
              <>
                {swipeTarget.icon} {swipeTarget.label} ›
              </>
            ) : (
              <>
                ‹ {swipeTarget.icon} {swipeTarget.label}
              </>
            )}
          </div>
        )}
        <div
          key={activeId}
          className={`app__view ${animate.current ? `app__view--${slideDir}` : ''}`}
          style={
            swipeX !== 0
              ? { transform: `translateX(${swipeX * 0.18}px)`, transition: 'none' }
              : undefined
          }
        >
          {active.render()}
        </div>
      </main>

      <nav className="tabbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={t.id === activeId ? 'active' : ''}
            onClick={() => goToTab(t.id)}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
