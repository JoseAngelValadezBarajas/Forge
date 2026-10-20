import type { HTMLAttributes, ReactNode } from "react";

export function Panel({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section {...props} className={["ui-panel", className].filter(Boolean).join(" ")}>{children}</section>;
}
