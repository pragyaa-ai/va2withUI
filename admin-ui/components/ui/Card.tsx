import { ReactNode } from "react";

interface CardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  glass?: boolean;
  hover?: boolean;
}

export function Card({
  title,
  description,
  children,
  className = "",
  glass = false,
  hover = false,
}: CardProps) {
  const baseClasses = "rounded-2xl border p-5 transition-all duration-300";
  const glassClasses = glass
    ? "bg-white/70 backdrop-blur-xl border-white/20 shadow-lg shadow-slate-200/50"
    : "bg-white border-slate-200 shadow-sm";
  const hoverClasses = hover
    ? "hover:shadow-lg hover:shadow-slate-200/80 hover:-translate-y-0.5"
    : "";

  return (
    <section className={`${baseClasses} ${glassClasses} ${hoverClasses} ${className}`}>
      {(title || description) && (
        <header className="mb-4">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
