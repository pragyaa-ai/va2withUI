"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { VOICE_NAMES, ACCENTS } from "@/lib/validation";

interface VoiceAgentSummary {
  id: string;
  name: string;
  voiceName: keyof typeof VOICE_NAMES;
  accent: keyof typeof ACCENTS;
  _count: { sessions: number };
}

export default function GlobalUsagePage() {
  const [agents, setAgents] = useState<VoiceAgentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/voiceagents")
      .then((r) => r.json())
      .then(setAgents)
      .finally(() => setLoading(false));
  }, []);

  const totalCalls = agents.reduce((acc, a) => acc + (a._count?.sessions ?? 0), 0);

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Usage Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Call activity across all VoiceAgents.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-slate-500">Total VoiceAgents</p>
          <p className="text-2xl font-semibold text-slate-900">{agents.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Total Calls</p>
          <p className="text-2xl font-semibold text-slate-900">{totalCalls}</p>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">By VoiceAgent</h2>
        {agents.length === 0 ? (
          <Card className="p-6 text-center text-slate-500">No VoiceAgents yet.</Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Voice</th>
                  <th className="py-2 pr-4">Accent</th>
                  <th className="py-2">Calls</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/voiceagents/${a.id}/usage`}
                        className="text-indigo-600 hover:underline"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{VOICE_NAMES[a.voiceName] || a.voiceName}</td>
                    <td className="py-2 pr-4">{ACCENTS[a.accent] || a.accent}</td>
                    <td className="py-2">{a._count?.sessions ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
