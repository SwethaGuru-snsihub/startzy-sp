'use client';
import Link from 'next/link';

type EmptyStateProps = {
  /** Short headline, e.g. 'Package review is not available yet'. */
  title: string;
  /** Stage identifier shown as a pill, e.g. 'Stage I'. */
  stage?: string;
  /** Optional back-link destination. */
  href?: string;
  /** Label for the back-link. */
  hrefLabel?: string;
  /** Body copy — explains why the section is empty and what it will contain. */
  children?: React.ReactNode;
};

export function EmptyState({ title, stage, href, hrefLabel, children }: EmptyStateProps) {
  return (
    <div
      className="panel p-8 flex flex-col items-center gap-4 text-center"
      style={{ border: '1px dashed var(--line-strong)' }}
      role="status"
      aria-label={title}
    >
      {/* Stage badge */}
      {stage && (
        <span
          className="pill t-micro px-3 py-1 font-bold"
          style={{ background: 'var(--subtle)', border: '1px solid var(--line-strong)', color: 'var(--muted)', fontSize: 11 }}
        >
          {stage}
        </span>
      )}

      {/* Icon placeholder */}
      <span
        className="w-12 h-12 rounded-2xl grid place-items-center"
        aria-hidden
        style={{ background: 'var(--subtle)', border: '1px solid var(--line)' }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
          <rect x="3" y="3" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <path d="M11 8v3M11 14h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>

      {/* Heading */}
      <h2 className="t-h3 font-bold text-[16px]">{title}</h2>

      {/* Body */}
      {children && (
        <p
          className="t-small text-[13px]"
          style={{ color: 'var(--muted)', maxWidth: '52ch', lineHeight: 1.6 }}
        >
          {children}
        </p>
      )}

      {/* Back link */}
      {href && hrefLabel && (
        <Link
          href={href}
          className="btn btn-sm"
          style={{ marginTop: 4, fontSize: 13 }}
        >
          ← {hrefLabel}
        </Link>
      )}
    </div>
  );
}
