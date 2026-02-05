"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";

interface Session {
  id: string;
  direction: string;
  fromNumber?: string;
  toNumber?: string;
  startedAt: string;
  durationSec?: number;
  minutesBilled?: number;
}

export default function UsagePage() {
  const params = useParams();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || []);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const totalCalls = sessions.length;
  const totalMinutes = sessions.reduce((acc, s) => acc + (s.minutesBilled || 0), 0);

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-slate-500">Total Calls</p>
          <p className="text-2xl font-semibold text-slate-900">{totalCalls}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Minutes Billed</p>
          <p className="text-2xl font-semibold text-slate-900">{totalMinutes.toFixed(2)}</p>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Call Sessions</h2>
        {sessions.length === 0 ? (
          <Card className="p-6 text-center text-slate-500">No calls yet.</Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-4">Direction</th>
                  <th className="py-2 pr-4">From</th>
                  <th className="py-2 pr-4">To</th>
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2 pr-4">Duration (s)</th>
                  <th className="py-2">Billed (min)</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{s.direction}</td>
                    <td className="py-2 pr-4">{s.fromNumber || "-"}</td>
                    <td className="py-2 pr-4">{s.toNumber || "-"}</td>
                    <td className="py-2 pr-4">
                      {new Date(s.startedAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{s.durationSec ?? "-"}</td>
                    <td className="py-2">{s.minutesBilled ?? "-"}</td>
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



