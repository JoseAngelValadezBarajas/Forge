import type { HTMLAttributes, ReactNode } from "react";

export function Card({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={["ui-card", className].filter(Boolean).join(" ")}>{children}</div>;
}
