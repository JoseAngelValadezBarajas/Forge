import { useState, type MouseEvent, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { downloadFile } from "../api/client";

export function DownloadLink({
  href,
  children,
  className,
  download,
  "aria-label": ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  download?: boolean | string;
  "aria-label"?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isTauri()) return;
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      await downloadFile(href, typeof download === "string" ? download : "forge-download");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Forge could not complete that request.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <a
        aria-label={ariaLabel}
        aria-disabled={pending || undefined}
        className={className}
        download={download}
        href={href}
        onClick={(event) => void handleClick(event)}
      >
        {children}
      </a>
      {error && <span className="form-error" role="alert">{error}</span>}
    </>
  );
}
