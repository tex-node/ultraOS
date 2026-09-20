import type { ButtonHTMLAttributes } from "react";

// D1 design-system button (system §11). Primary is neon green on near-black, weight 600,
// radius 8–10px. `courtside` is the 52px+ tablet-first size for scorekeeper consoles.
// Server-safe (no client JS).
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "courtside";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-brand-400 font-semibold text-ink-900 transition hover:bg-brand-300",
  secondary: "border border-line-strong text-text-1 transition hover:border-brand-400/40 hover:text-white",
  ghost: "text-text-2 transition hover:bg-white/[0.06] hover:text-white",
  danger: "border border-danger/30 text-danger transition hover:bg-danger/10",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "min-h-[36px] rounded-md px-3 text-xs",
  md: "min-h-[44px] rounded-md px-4 text-sm",
  lg: "min-h-[48px] rounded-md px-5 text-sm",
  courtside: "min-h-[52px] min-w-[52px] rounded-md px-4 text-base font-bold active:scale-95",
};

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`${variants[variant]} ${sizes[size]} ${className}`} {...rest} />;
}
