"use client";

import { useFormStatus } from "react-dom";

// Disables itself (and every other submit control in the same <form>, since useFormStatus's
// `pending` is form-wide) while a submission is in flight. This is the primary guard against
// double-submit: a rapid double-tap on a score button, or tapping a second control before the
// first request lands, can't fire a second request until the first one resolves.
export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...props
}: React.ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={pending || props.disabled} className={className}>
      {pending ? (pendingLabel ?? "…") : children}
    </button>
  );
}
