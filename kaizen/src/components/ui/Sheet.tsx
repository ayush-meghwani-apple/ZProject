import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import AppIcon from '../AppIcon';

interface SheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  closeLabel?: string;
}

export default function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  className = '',
  bodyClassName = '',
  closeLabel = 'Close',
}: SheetProps) {
  const titleId = useId();

  return createPortal(
    <div className="modal__backdrop modal__backdrop--form ui-sheet__backdrop" onClick={onClose}>
      <section
        className={`modal__card ui-sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="formdrawer__head ui-sheet__head">
          <div className="ui-sheet__heading">
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p className="card__subtitle ui-sheet__subtitle">{subtitle}</p>}
          </div>
          <button className="iconbtn" type="button" aria-label={closeLabel} onClick={onClose}>
            <AppIcon name="close" size={18} />
          </button>
        </div>
        <div className={`ui-sheet__body ${bodyClassName}`.trim()}>{children}</div>
        {footer && <div className="modal__footer ui-sheet__footer">{footer}</div>}
      </section>
    </div>,
    document.body,
  );
}