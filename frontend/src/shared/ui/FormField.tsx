import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
};

export function FormField({
  children,
  error,
  hint,
  id,
  label,
  className,
}: {
  children: ReactElement<ControlProps>;
  className?: string;
  error?: string;
  hint?: string;
  id?: string;
  label: ReactNode;
}) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const describedBy = [
    hint ? `${controlId}-hint` : null,
    error ? `${controlId}-error` : null,
    children.props["aria-describedby"] ?? null,
  ]
    .filter(Boolean)
    .join(" ");
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? controlId,
        "aria-describedby": describedBy || undefined,
      })
    : children;

  return (
    <label className={["form-field", className].filter(Boolean).join(" ")}>
      <span className="form-field-label">
        {label}
        {hint && <span className="field-hint" id={`${controlId}-hint`}>{hint}</span>}
      </span>
      {control}
      {error && <span className="form-error" id={`${controlId}-error`} role="alert">{error}</span>}
    </label>
  );
}
