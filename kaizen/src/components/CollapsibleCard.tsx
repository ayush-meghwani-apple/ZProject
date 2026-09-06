import type { ComponentProps, ReactNode } from 'react';
import AppIcon from './AppIcon';
import Section from './ui/Section';

interface Props {
  title: string;
  subtitle?: string;
  icon?: ComponentProps<typeof AppIcon>['name'];
  compact?: boolean;
  /** Whether the section starts expanded. Defaults to collapsed. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A settings card with a tap-to-expand header, matching the Data & Backup card. */
export default function CollapsibleCard({
  title,
  subtitle,
  icon,
  compact = false,
  defaultOpen = false,
  children,
}: Props) {
  return (
    <Section title={title} subtitle={subtitle} icon={icon} compact={compact} collapsible defaultOpen={defaultOpen}>
      {children}
    </Section>
  );
}
