import type { ButtonHTMLAttributes } from "react";

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={["icon-button", className].filter(Boolean).join(" ")}
      type={props.type ?? "button"}
    />
  );
}
