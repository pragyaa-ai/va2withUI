"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";

export function Topbar() {
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use consistent defaults on server, update on client after mount
  const userName = mounted ? (session?.user?.name || session?.user?.email || "User") : "User";
  const userRole = mounted ? (session?.user?.role || "USER") : "USER";

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">Admin Console</div>
        <div className="text-xs text-slate-500">
          Manage call flows, guardrails, voice, and usage.
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium text-slate-700">{userName}</div>
          <div className="text-xs text-slate-500">
            {userRole === "ADMIN" ? "Administrator" : "User"}
          </div>
        </div>
        <Button variant="secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
