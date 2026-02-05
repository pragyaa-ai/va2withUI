"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { SidebarNav } from "@/components/SidebarNav";
import { Topbar } from "@/components/Topbar";

// Customer branding from environment variables
// Set NEXT_PUBLIC_CUSTOMER_NAME and NEXT_PUBLIC_CUSTOMER_LOGO in .env.local
const CUSTOMER_NAME = process.env.NEXT_PUBLIC_CUSTOMER_NAME || "VoiceAgent";
const CUSTOMER_LOGO = process.env.NEXT_PUBLIC_CUSTOMER_LOGO || "/logos/default.png";

// Optional: Override branding per customerSlug (for multi-tenant setups)
const CUSTOMER_BRANDING: Record<string, { logo: string; name: string }> = {
  // Add customer-specific branding here if using multi-tenant mode
  // "customername": { logo: "/logos/customername.png", name: "Customer Name" },
  default: {
    logo: CUSTOMER_LOGO,
    name: CUSTOMER_NAME,
  },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Always use default on server, then update on client after mount
  const customerSlug = mounted ? (session?.user?.customerSlug || "default") : "default";
  const branding = CUSTOMER_BRANDING[customerSlug] || CUSTOMER_BRANDING.default;

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-6 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ minHeight: "calc(100vh - 3rem)" }}>
            {/* Customer Logo */}
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center justify-center py-2">
                <Image
                  src={branding.logo}
                  alt={branding.name}
                  width={140}
                  height={40}
                  className="object-contain"
                  priority
                />
              </div>
            </div>

            {/* VoiceAgent Admin */}
            <div className="p-4">
              <Link href="/" className="block rounded-xl px-2 py-2 hover:bg-slate-50">
                <div className="text-sm font-semibold text-slate-900">VoiceAgent Admin</div>
                <div className="text-xs text-slate-500">Configuration & analytics</div>
              </Link>
              <div className="mt-4">
                <SidebarNav />
              </div>
            </div>

            {/* Spacer to push footer to bottom */}
            <div className="flex-1" />

            {/* Powered by Pragyaa.ai */}
            <div className="p-4 border-t border-slate-100">
              <div className="flex flex-col items-center gap-2 py-2">
                <span className="text-xs text-slate-400">Powered by</span>
                <Image
                  src="/logos/pragyaa.png"
                  alt="Pragyaa.ai"
                  width={100}
                  height={28}
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <Topbar />
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
