import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// D1 form field (system §12): #1A1F26 surface, #272D37 border, green focus glow, red error.
const controlClass =
  "min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm text-text-1 transition placeholder:text-text-3 focus:border-brand-400 focus:shadow-glow-green focus:outline-none";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
};

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="block text-sm text-text-2">
      {label}
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-text-3">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} [color-scheme:dark] ${props.className ?? ""}`} />;
}

export function TextAreaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} py-3 ${props.className ?? ""}`} />;
}
