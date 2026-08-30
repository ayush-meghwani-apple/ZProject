import { useState, type ComponentProps, type ReactNode } from 'react';
import AppIcon from './AppIcon';

interface Props {
  title: string;
  subtitle?: string;
  icon?: ComponentProps<typeof AppIcon>['name'];
  /** Whether the section starts expanded. Defaults to collapsed. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A settings card with a tap-to-expand header, matching the Data & Backup card. */
export default function CollapsibleCard({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button className="scard__head" onClick={() => setOpen((o) => !o)}>
        {icon && (
          <span className="scard__icon">
            <AppIcon name={icon} size={22} />
          </span>
        )}
        <span className="scard__headtext">
          <span className="scard__title">{title}</span>
          {subtitle && <span className="scard__sub">{subtitle}</span>}
        </span>
        <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
