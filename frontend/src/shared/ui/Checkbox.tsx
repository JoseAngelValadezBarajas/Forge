import { forwardRef, type InputHTMLAttributes } from "react";

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className, type = "checkbox", ...props }, ref) {
    return <input {...props} className={className} ref={ref} type={type} />;
  },
);
