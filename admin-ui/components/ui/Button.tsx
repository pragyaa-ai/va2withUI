import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 " +
    "disabled:opacity-60 disabled:pointer-events-none";

  const styles: Record<Variant, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500",
    secondary: "bg-white border border-slate-200 text-slate-900 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100"
  };

  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}




