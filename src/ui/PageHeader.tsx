'use client';

type PageHeaderProps = {
  /** Small label rendered above the title, e.g. 'Solution Builder'. */
  eyebrow?: string;
  /** Main heading. */
  title: string;
  /** Optional content rendered to the right of the title block. */
  actions?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-0.5">
        {eyebrow && (
          <span className="t-caps text-[11px]" style={{ color: 'var(--muted)' }}>
            {eyebrow}
          </span>
        )}
        <h1 className="t-h2 font-extrabold text-[22px] leading-tight">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
