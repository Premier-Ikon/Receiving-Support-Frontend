"use client";

export default function PlaceholderView({
  title,
  subtitle,
  body,
  onNew,
  actionLabel = "New receipt",
}: {
  title: string;
  subtitle: string;
  body: string;
  onNew: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="app-shell">
      <header className="list-header">
        <div className="list-toolbar">
          <button type="button" onClick={onNew}>
            {actionLabel}
          </button>
          <span />
        </div>
        <h1>{title}</h1>
        <p className="progress-copy">{subtitle}</p>
      </header>
      <section className="list-card empty-state">{body}</section>
    </div>
  );
}
