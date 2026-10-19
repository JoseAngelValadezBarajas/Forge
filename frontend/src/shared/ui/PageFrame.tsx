import type { ReactNode } from "react";

type PaletteOpener = (button: HTMLButtonElement) => void;

export function PageFrame({
  title,
  subtitle,
  onOpenPalette,
  breadcrumbs,
  children,
}: {
  title: string;
  subtitle: string;
  onOpenPalette: PaletteOpener;
  breadcrumbs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page-frame">
      {breadcrumbs}
      <header className="workspace-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <button
          className="command-trigger"
          onClick={(event) => onOpenPalette(event.currentTarget)}
          type="button"
        >
          <span className="command-key">Ctrl K</span>
          <span>Search or command</span>
        </button>
      </header>
      {children}
    </div>
  );
}
