import type { CSSProperties } from 'react';

const MOTION_KIND: Record<string, string> = {
  'flat-home-v1': 'home',
  'flat-food-v1': 'food',
  'flat-transport-v1': 'transport',
  'flat-bills-v1': 'bills',
  'flat-health-v1': 'health',
  'flat-shopping-v1': 'shopping',
  'flat-entertainment-v1': 'entertainment',
  'flat-travel-v1': 'travel',
  'flat-family-v1': 'family',
  'flat-investments-v1': 'savings',
  'flat-other-v1': 'other',
};

const ACCENTS: Record<string, [string, string]> = {
  home: ['🔑', '✦'],
  food: ['♨', '✦'],
  transport: ['●', '〰'],
  bills: ['₹', '✓'],
  health: ['♥', '+'],
  shopping: ['✦', '●'],
  entertainment: ['★', '▶'],
  travel: ['☁', '☁'],
  family: ['♥', '♥'],
  savings: ['₹', '●'],
  other: ['?', '✦'],
};

interface Props {
  categoryId?: string;
  color: string;
  icon: string;
  name?: string;
  active: boolean;
}

export default function CategoryMotion({ categoryId, color, icon, name, active }: Props) {
  if (!active) return <div className="reel__icon">{icon}</div>;

  const kind = MOTION_KIND[categoryId ?? ''] ?? 'other';
  const accents = ACCENTS[kind];
  const style = { '--motion-color': color } as CSSProperties;

  return (
    <div className={`reel-motion reel-motion--${kind}`} style={style} role="img" aria-label={name}>
      <span className="reel-motion__halo" />
      <span className="reel-motion__trail" />
      <span className="reel-motion__accent reel-motion__accent--one">{accents[0]}</span>
      <span className="reel-motion__accent reel-motion__accent--two">{accents[1]}</span>
      <span className="reel-motion__subject" aria-hidden="true">{icon}</span>
      <span className="reel-motion__shadow" />
    </div>
  );
}