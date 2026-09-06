import { useState, type ReactNode } from 'react';
import AppIcon, { type IconName } from '../AppIcon';

type SectionAppearance = 'card' | 'planner';

interface SectionProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  icon?: IconName;
  danger?: boolean;
  compact?: boolean;
  appearance?: SectionAppearance;
}

export default function Section({
  title,
  subtitle,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  icon,
  danger = false,
  compact = false,
  appearance = 'card',
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const planner = appearance === 'planner';
  const rootClass = planner
    ? `ui-section ft-section${collapsible ? ' ft-section--collapsible' : ''}${open ? ' ft-section--open' : ''}`
    : `ui-section card${compact ? ' scard--compact' : ''}${compact && open ? ' scard--open' : ''}`;
  const iconElement = icon ? (
    <span className={`ui-section__icon ${planner ? 'ft-section__icon' : 'scard__icon'}${danger ? ' ft-section__icon--danger' : ''}`}>
      <AppIcon name={icon} size={planner ? 20 : 22} />
    </span>
  ) : null;

  const heading = (
    <>
      {iconElement}
      <span className={`ui-section__headtext ${planner ? 'ft-section__headtext' : 'scard__headtext'}`}>
        <span className={`ui-section__title ${planner ? 'ft-section__title' : 'scard__title'}`}>{title}</span>
        {subtitle && <span className={`ui-section__subtitle ${planner ? 'ft-section__sub' : 'scard__sub'}`}>{subtitle}</span>}
      </span>
    </>
  );

  if (collapsible) {
    return (
      <section className={rootClass}>
        <div className={`ui-section__toggle ${planner ? 'ft-section__toggle' : ''}`}>
          <button
            type="button"
            className={`ui-section__header ${planner ? 'ft-section__togglehead' : 'scard__head'}`}
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
          >
            {heading}
            <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
          </button>
          {actions && <span className={`ui-section__actions ${planner ? 'ft-section__toggleactions' : ''}`}>{actions}</span>}
        </div>
        {open && <div className={`ui-section__body ${planner ? 'ft-section__body' : ''}`}>{children}</div>}
      </section>
    );
  }

  return (
    <section className={rootClass}>
      <div className={`ui-section__header ${planner ? 'ft-section__head' : 'scard__head'}`}>
        {heading}
        {actions}
      </div>
      <div className={`ui-section__body ${planner ? 'ft-section__body' : ''}`}>{children}</div>
    </section>
  );
}