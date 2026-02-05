"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";

interface FeedbackItem {
  id: string;
  source: string;
  message: string;
  createdAt: string;
}

export default function FeedbackPage() {
  const params = useParams();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadFeedback = async () => {
    const res = await fetch(`/api/feedback?voiceAgentId=${params.id}`);
    const data = await res.json();
    setItems(data);
  };

  useEffect(() => {
    loadFeedback().finally(() => setLoading(false));
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSaving(true);
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceAgentId: params.id, message }),
    });
    setMessage("");
    await loadFeedback();
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* How Feedback Works */}
      <Card className="p-5 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">How Feedback Works</h3>
            <p className="text-sm text-slate-600 mt-1">
              Feedback is <strong>reviewed manually</strong> by your team, then used to update the Call Flow,
              Guardrails, or Voice settings. After making changes, test again to verify the improvement.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Pending Review
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                In Progress
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Resolved
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Add Feedback */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Add Feedback</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Describe what happened during testing...

Examples:
• Agent didn't ask for name confirmation
• Response was too slow after greeting
• Hindi language wasn't used even though caller spoke Hindi"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Be specific about what needs improvement
            </p>
            <Button type="submit" disabled={saving || !message.trim()}>
              {saving ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Feedback List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent Feedback</h2>
          <span className="text-sm text-slate-500">{items.length} items</span>
        </div>

        {items.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-slate-500">No feedback yet</p>
            <p className="text-xs text-slate-400 mt-1">Submit feedback after testing the VoiceAgent</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((fb, idx) => (
              <Card key={fb.id} className="p-4 hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                      <span className="font-medium text-slate-500">{fb.source}</span>
                      <span>·</span>
                      <span>{new Date(fb.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{fb.message}</p>
                  </div>
                  <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    idx === 0 
                      ? "bg-amber-100 text-amber-700" 
                      : idx === 1 
                      ? "bg-blue-100 text-blue-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-blue-500" : "bg-emerald-500"
                    }`} />
                    {idx === 0 ? "Pending" : idx === 1 ? "In Progress" : "Resolved"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
