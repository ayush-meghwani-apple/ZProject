import { useRef, useState } from 'react';

/** Convert HSL to a #rrggbb hex string. */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

interface Props {
  onPick: (hex: string) => void;
}

/**
 * An always-open colour spectrum: a rainbow hue bar plus a light↔dark bar. Built
 * from <div>s (which don't steal focus) so dragging keeps the note's selection
 * alive and picking a colour never closes the popover.
 */
export default function ColorSpectrum({ onPick }: Props) {
  const [hue, setHue] = useState(230);
  const [light, setLight] = useState(58);
  const drag = useRef<'hue' | 'light' | null>(null);

  const SAT = 92;
  const color = hslToHex(hue, SAT, light);

  function ratio(e: React.PointerEvent, el: HTMLElement): number {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }
  function setHueFrom(x: number) {
    const h = Math.round(x * 360);
    setHue(h);
    onPick(hslToHex(h, SAT, light));
  }
  function setLightFrom(x: number) {
    const l = Math.round(x * 100);
    setLight(l);
    onPick(hslToHex(hue, SAT, l));
  }

  function handler(axis: 'hue' | 'light') {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = axis;
        const x = ratio(e, e.currentTarget as HTMLElement);
        axis === 'hue' ? setHueFrom(x) : setLightFrom(x);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (drag.current !== axis) return;
        const x = ratio(e, e.currentTarget as HTMLElement);
        axis === 'hue' ? setHueFrom(x) : setLightFrom(x);
      },
      onPointerUp: () => {
        drag.current = null;
      },
    };
  }

  return (
    <div className="spectrum">
      <div className="spectrum__bar spectrum__hue" {...handler('hue')}>
        <span className="spectrum__thumb" style={{ left: `${(hue / 360) * 100}%` }} />
      </div>
      <div
        className="spectrum__bar spectrum__light"
        style={{ background: `linear-gradient(to right, #000, ${hslToHex(hue, SAT, 50)}, #fff)` }}
        {...handler('light')}
      >
        <span className="spectrum__thumb" style={{ left: `${light}%` }} />
      </div>
      <div className="spectrum__preview" style={{ background: color, color: light > 62 ? '#111' : '#fff' }}>
        {color}
      </div>
    </div>
  );
}
