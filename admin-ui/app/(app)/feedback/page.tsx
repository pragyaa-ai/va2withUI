"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

interface FeedbackItem {
  id: string;
  source: string;
  message: string;
  createdAt: string;
  voiceAgent?: { id: string; name: string };
}

export default function GlobalFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">All Feedback</h1>
        <p className="mt-1 text-sm text-slate-500">Recent feedback across all VoiceAgents.</p>
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">No feedback yet.</Card>
      ) : (
        <div className="space-y-3">
          {items.map((fb) => (
            <Card key={fb.id} className="p-4">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <div className="flex gap-2">
                  <span>{fb.source}</span>
                  {fb.voiceAgent && (
                    <>
                      <span>·</span>
                      <Link
                        href={`/voiceagents/${fb.voiceAgent.id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {fb.voiceAgent.name}
                      </Link>
                    </>
                  )}
                </div>
                <span>{new Date(fb.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm text-slate-700">{fb.message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
