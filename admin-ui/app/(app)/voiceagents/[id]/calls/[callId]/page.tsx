"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface ConversationEntry {
  timestamp: string;
  speaker: string;
  text: string;
  event_type?: string;
}

interface ExtractedData {
  full_name?: string;
  car_model?: string;
  email_id?: string;
  test_drive_interest?: string;
  confidence_scores?: {
    name_confidence?: number;
    car_confidence?: number;
    email_confidence?: number;
    test_drive_confidence?: number;
  };
  data_points?: Record<string, unknown>;
  overall_status?: string;
}

interface CallDetail {
  id: string;
  callId?: string;
  direction: string;
  fromNumber?: string;
  toNumber?: string;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  minutesBilled?: number;
  outcome?: string;
  sentiment?: string;
  sentimentScore?: number;
  summary?: string;
  transcript?: ConversationEntry[];
  extractedData?: ExtractedData;
  analyticsJson?: Record<string, unknown>;
  payloadJson?: Record<string, unknown>;
}

type TabType = "summary" | "extracted" | "payload";

export default function CallDetailPage() {
  const params = useParams();
  const [call, setCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSentiment, setGeneratingSentiment] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("summary");

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}/calls/${params.callId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setCall(null);
        } else {
          setCall(data);
        }
      })
      .finally(() => setLoading(false));
  }, [params.id, params.callId]);

  const generateSentiment = async () => {
    if (!call) return;
    setGeneratingSentiment(true);
    try {
      const res = await fetch(
        `/api/voiceagents/${params.id}/calls/${params.callId}/sentiment`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.sentiment) {
        setCall({
          ...call,
          sentiment: data.sentiment,
          sentimentScore: data.sentimentScore,
          summary: data.summary,
        });
      }
    } catch (error) {
      console.error("Error generating sentiment:", error);
    }
    setGeneratingSentiment(false);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getSentimentBadge = (sentiment?: string, score?: number) => {
    const styles: Record<string, { bg: string; text: string; icon: string }> = {
      POSITIVE: { bg: "bg-emerald-100", text: "text-emerald-700", icon: "😊" },
      NEUTRAL: { bg: "bg-slate-100", text: "text-slate-700", icon: "😐" },
      NEGATIVE: { bg: "bg-red-100", text: "text-red-700", icon: "😞" },
    };
    if (!sentiment) return null;
    const style = styles[sentiment] || styles.NEUTRAL;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${style.bg} ${style.text}`}>
        <span>{style.icon}</span>
        {sentiment.toLowerCase()}
        {score !== undefined && (
          <span className="text-xs opacity-75">({(score * 100).toFixed(0)}%)</span>
        )}
      </span>
    );
  };

  const getOutcomeBadge = (outcome?: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      COMPLETE: { bg: "bg-emerald-100", text: "text-emerald-700" },
      PARTIAL: { bg: "bg-amber-100", text: "text-amber-700" },
      INCOMPLETE: { bg: "bg-red-100", text: "text-red-700" },
      TRANSFERRED: { bg: "bg-violet-100", text: "text-violet-700" },
    };
    if (!outcome) return null;
    const style = styles[outcome] || { bg: "bg-slate-100", text: "text-slate-700" };
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${style.bg} ${style.text}`}>
        {outcome.toLowerCase()}
      </span>
    );
  };

  const getConfidenceBadge = (confidence?: number) => {
    if (confidence === undefined) return null;
    const percent = Math.round(confidence * 100);
    let colorClass = "bg-emerald-100 text-emerald-700";
    if (percent < 70) colorClass = "bg-amber-100 text-amber-700";
    if (percent < 50) colorClass = "bg-red-100 text-red-700";
    return (
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}>
        {percent}%
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading call details...</div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Call not found</p>
        <Link
          href={`/voiceagents/${params.id}/calls`}
          className="text-indigo-600 hover:text-indigo-700"
        >
          ← Back to calls
        </Link>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: "summary", label: "Summary & Sentiment" },
    { id: "extracted", label: "Extracted Data" },
    { id: "payload", label: "Raw Payload" },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={`/voiceagents/${params.id}/calls`} className="hover:text-indigo-600">
          Calls
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">
          {call.callId?.slice(-8) || call.id.slice(-8)}
        </span>
      </div>

      {/* Header Card */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">Call Details</h1>
              {getOutcomeBadge(call.outcome)}
              {getSentimentBadge(call.sentiment, call.sentimentScore as number | undefined)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Date</p>
                <p className="font-medium text-slate-900">
                  {new Date(call.startedAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Time</p>
                <p className="font-medium text-slate-900">
                  {new Date(call.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Duration</p>
                <p className="font-medium text-slate-900">
                  {call.durationSec ? formatDuration(call.durationSec) : "-"}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Call ID</p>
                <p className="font-mono text-xs text-slate-700">
                  {call.callId || call.id}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!call.sentiment && call.transcript && (
              <Button onClick={generateSentiment} disabled={generatingSentiment}>
                {generatingSentiment ? "Analyzing..." : "Generate Sentiment"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* Summary Tab */}
        {activeTab === "summary" && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Call Summary</h3>
            {call.summary ? (
              <div className="prose prose-slate max-w-none">
                <p className="text-slate-700 leading-relaxed">{call.summary}</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No summary generated yet.</p>
                {call.transcript && (
                  <Button onClick={generateSentiment} disabled={generatingSentiment}>
                    {generatingSentiment ? "Generating..." : "Generate Summary & Sentiment"}
                  </Button>
                )}
              </div>
            )}

            {call.sentiment && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Sentiment Analysis</h4>
                <div className="flex items-center gap-4">
                  {getSentimentBadge(call.sentiment, call.sentimentScore as number | undefined)}
                  {call.sentimentScore !== undefined && (
                    <div className="flex-1 max-w-xs">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            call.sentiment === "POSITIVE"
                              ? "bg-emerald-500"
                              : call.sentiment === "NEGATIVE"
                              ? "bg-red-500"
                              : "bg-slate-400"
                          }`}
                          style={{ width: `${(call.sentimentScore as number) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Extracted Data Tab */}
        {activeTab === "extracted" && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Extracted Sales Data</h3>
            {call.extractedData ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-slate-500 uppercase">Customer Name</p>
                      {getConfidenceBadge(call.extractedData.confidence_scores?.name_confidence)}
                    </div>
                    <p className="text-lg font-semibold text-slate-900">
                      {call.extractedData.full_name || (
                        <span className="text-slate-400 font-normal">Not captured</span>
                      )}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-slate-500 uppercase">Car Model</p>
                      {getConfidenceBadge(call.extractedData.confidence_scores?.car_confidence)}
                    </div>
                    <p className="text-lg font-semibold text-slate-900">
                      {call.extractedData.car_model || (
                        <span className="text-slate-400 font-normal">Not captured</span>
                      )}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-slate-500 uppercase">Email ID</p>
                      {getConfidenceBadge(call.extractedData.confidence_scores?.email_confidence)}
                    </div>
                    <p className="text-lg font-semibold text-slate-900">
                      {call.extractedData.email_id || (
                        <span className="text-slate-400 font-normal">Not captured</span>
                      )}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-slate-500 uppercase">Test Drive Interest</p>
                      {getConfidenceBadge(call.extractedData.confidence_scores?.test_drive_confidence)}
                    </div>
                    <p className="text-lg font-semibold text-slate-900">
                      {call.extractedData.test_drive_interest || (
                        <span className="text-slate-400 font-normal">Not captured</span>
                      )}
                    </p>
                  </div>
                </div>

                {call.extractedData.overall_status && (
                  <div className="pt-4 border-t border-slate-200">
                    <p className="text-sm text-slate-600">
                      Overall Status:{" "}
                      <span className="font-medium capitalize">{call.extractedData.overall_status}</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">
                No extracted data available for this call.
              </p>
            )}
          </Card>
        )}

        {/* Raw Payload Tab */}
        {activeTab === "payload" && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">SI Payload</h3>
            {call.payloadJson ? (
              <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-slate-100 font-mono whitespace-pre-wrap">
                  {JSON.stringify(call.payloadJson, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">
                No payload available for this call.
              </p>
            )}

            {call.analyticsJson && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Call Analytics</h4>
                <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-slate-100 font-mono whitespace-pre-wrap">
                    {JSON.stringify(call.analyticsJson, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
