import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | (string & {});

export function Badge({ children, className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode; tone?: BadgeTone }) {
  return <span {...props} className={["badge", tone, className].filter(Boolean).join(" ")}>{children}</span>;
}
