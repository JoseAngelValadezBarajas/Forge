import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({
  children,
  className,
  loading = false,
  loadingLabel = "Saving…",
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={["button", variant, className].filter(Boolean).join(" ")}
      disabled={loading || props.disabled}
      type={props.type ?? "button"}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
