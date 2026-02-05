"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const allNav = [
  { href: "/", label: "Dashboard", roles: ["ADMIN", "USER"] },
  { href: "/voiceagents", label: "VoiceAgents", roles: ["ADMIN", "USER"] },
  { href: "/feedback", label: "Feedback", roles: ["ADMIN", "USER"] },
  { href: "/usage", label: "Usage", roles: ["ADMIN"] },
];

export function SidebarNav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Get user role - use USER as default on server to ensure consistent hydration
  const userRole = mounted ? (session?.user?.role || "USER") : "USER";
  
  // Filter nav items based on role
  const nav = allNav.filter((item) => item.roles.includes(userRole));

  return (
    <nav className="space-y-1">
      {nav.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "block rounded-xl px-3 py-2 text-sm transition " +
              (active
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-700 hover:bg-slate-50")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
