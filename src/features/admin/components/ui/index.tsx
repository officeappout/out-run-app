'use client';

/**
 * Admin UI kit — the site's design language for page content. Use these in
 * new and redesigned screens instead of ad-hoc Tailwind cards, so the panel
 * converges on one look. Styles: admin-ui.module.css.
 */
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import ui from './admin-ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** page header: eyebrow, a light/black title, subtitle, actions on the side */
export function PageHeader({
  eyebrow,
  title,
  strong,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  /** light part of the title */
  title: string;
  /** optional bold part, appended after the light part */
  strong?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={cx(ui.root, ui.header)}>
      <div className={ui.headerText}>
        {eyebrow && <span className={ui.eyebrow}>{eyebrow}</span>}
        <h1 className={ui.title}>
          {title}
          {strong && <> <b>{strong}</b></>}
        </h1>
        {subtitle && <p className={ui.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={ui.actions}>{actions}</div>}
    </header>
  );
}

/** link tabs between sibling screens of one area; the current one is the gradient pill */
export function AreaTabs({ tabs, current }: { tabs: { href: string; label: string; hidden?: boolean }[]; current: string }) {
  return (
    <nav className={cx(ui.root, ui.tabs)} aria-label="מסכים באזור">
      {tabs.filter((t) => !t.hidden).map((t) => (
        <Link key={t.href} href={t.href} className={cx(ui.tab, t.href === current && ui.tabCurrent)} aria-current={t.href === current ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** in-page tabs (buttons, not links); the current one is the gradient pill */
export function SegmentTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className={cx(ui.root, ui.tabs)} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cx(ui.tab, t.id === value && ui.tabCurrent)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx(ui.root, ui.panel, className)}>
      {title && <h2 className={ui.panelTitle}>{title}</h2>}
      {children}
    </section>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className={cx(ui.root, ui.kpiGrid)}>{children}</div>;
}

export function KpiCard({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={cx(ui.root, ui.panel)}>
      <span className={ui.kpiLabel}>{label}</span>
      <span className={ui.kpiValue}>{value}</span>
      {sub && <span className={ui.kpiSub}>{sub}</span>}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger';
export function Button({ variant = 'secondary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const v = variant === 'primary' ? ui.btnPrimary : variant === 'danger' ? ui.btnDanger : ui.btnSecondary;
  return <button type="button" {...props} className={cx(ui.root, ui.btn, v, className)} />;
}

export type PillTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';
export function StatusPill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  const t = { neutral: ui.pillNeutral, good: ui.pillGood, warn: ui.pillWarn, bad: ui.pillBad, info: ui.pillInfo }[tone];
  return <span className={cx(ui.pill, t)}>{children}</span>;
}

/** loading skeleton blocks */
export function Skeleton({ height = 96, count = 1 }: { height?: number; count?: number }) {
  return (
    <div style={{ display: 'grid', gap: 12 }} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, i) => <div key={i} className={cx(ui.root, ui.skeleton)} style={{ height }} />)}
    </div>
  );
}

/** an empty state: says what this space is and how to fill it */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx(ui.root, ui.state)}>
      <p className={ui.stateTitle}>{title}</p>
      {children && <p style={{ margin: 0 }}>{children}</p>}
      {action}
    </div>
  );
}

/** an error state: what went wrong + retry — never pass a failure off as "no data" */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={cx(ui.root, ui.state, ui.stateError)} role="alert">
      <AlertCircle size={22} color="#b42318" aria-hidden />
      <p style={{ margin: 0, color: '#7a271a' }}>{message}</p>
      {onRetry && (
        <Button onClick={onRetry}>
          <RefreshCw size={14} aria-hidden /> נסה שוב
        </Button>
      )}
    </div>
  );
}
