import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={
        "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm " +
        "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
        ` ${className}`
      }
      {...props}
    />
  );
}




