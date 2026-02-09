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

interface CallControlEvent {
  type: "hangup" | "transfer";
  reason?: string;
  timestamp: string;
  status?: string;
}

interface WebhookResponse {
  success: boolean;
  status_code: number;
  response_body: string;
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
  waybeoPayloadJson?: Record<string, unknown>;
  callControlEvent?: CallControlEvent;
  siWebhookResponse?: WebhookResponse;
  waybeoWebhookResponse?: WebhookResponse;
  waybeoHeaders?: Record<string, unknown>;
}

type TabType = "summary" | "extracted" | "waybeoHeaders" | "siPayload" | "waybeoPayload";

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
    { id: "waybeoHeaders", label: "Waybeo Call Data" },
    { id: "siPayload", label: "SI Payload" },
    { id: "waybeoPayload", label: "Waybeo Payload" },
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

        {/* Waybeo Call Data Tab */}
        {activeTab === "waybeoHeaders" && (
          <Card className="p-6">
            {call.waybeoHeaders && Object.keys(call.waybeoHeaders).length > 0 ? (
              (() => {
                const raw = call.waybeoHeaders!;
                // New format: { start_event: {...}, ws_headers: {...} }
                const startEvent = (raw as Record<string, unknown>).start_event as Record<string, unknown> | undefined;
                const wsHeaders = (raw as Record<string, unknown>).ws_headers as Record<string, string> | undefined;
                // Legacy format: flat headers object (no start_event key)
                const isNewFormat = !!startEvent;

                // Extract key fields from start event (new format) or headers (legacy)
                const callId = isNewFormat
                  ? (startEvent?.ucid as string) || ""
                  : "";
                const customerNumber = isNewFormat
                  ? (startEvent?.did as string) || ""
                  : "";
                const vmn = isNewFormat
                  ? (startEvent?.vmn as string) || ""
                  : "";

                return (
                  <div className="space-y-6">
                    {/* Section 1: Start Event Data */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-2">Waybeo Start Event</h3>
                      <p className="text-xs text-slate-500 mb-4">
                        Data received from Waybeo in the WebSocket start event when the call was initiated. Contains call ID (UCID), customer number (DID), and VMN used for store code lookup.
                      </p>

                      {/* Key fields highlighted */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                          <p className="text-xs font-medium text-indigo-500 uppercase mb-1">Call ID (UCID)</p>
                          <p className="text-sm font-mono font-semibold text-indigo-900">
                            {callId || (
                              <span className="text-slate-400 font-normal">Not available</span>
                            )}
                          </p>
                        </div>

                        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                          <p className="text-xs font-medium text-emerald-500 uppercase mb-1">Customer Number (DID)</p>
                          <p className="text-sm font-mono font-semibold text-emerald-900">
                            {customerNumber || (
                              <span className="text-slate-400 font-normal">Not available</span>
                            )}
                          </p>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                          <p className="text-xs font-medium text-amber-500 uppercase mb-1">VMN (Kia Number)</p>
                          <p className="text-sm font-mono font-semibold text-amber-900">
                            {vmn || (
                              <span className="text-slate-400 font-normal">Not available</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Raw Start Event JSON */}
                    {isNewFormat && startEvent && (
                      <div className="pt-4 border-t border-slate-200">
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">Raw Start Event</h4>
                        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                          <pre className="text-sm text-slate-100 font-mono whitespace-pre-wrap">
                            {JSON.stringify(startEvent, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Section 3: WebSocket Headers (collapsible) */}
                    {wsHeaders && Object.keys(wsHeaders).length > 0 && (
                      <details className="pt-4 border-t border-slate-200">
                        <summary className="text-sm font-semibold text-slate-900 mb-3 cursor-pointer hover:text-slate-700">
                          WebSocket HTTP Headers <span className="text-xs font-normal text-slate-400">({Object.keys(wsHeaders).length} headers)</span>
                        </summary>
                        <div className="mt-3 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200">
                                <th className="text-left px-4 py-2 font-medium text-slate-600 w-1/3">Header</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-600">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(wsHeaders).map(([key, value], idx) => (
                                <tr key={key} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                                  <td className="px-4 py-2 font-mono text-xs text-slate-700 font-medium">{key}</td>
                                  <td className="px-4 py-2 font-mono text-xs text-slate-600 break-all">{String(value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}

                    {/* Legacy format: show flat headers as a table (old calls before this update) */}
                    {!isNewFormat && (
                      <div className="pt-4 border-t border-slate-200">
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">All Headers (Legacy)</h4>
                        <p className="text-xs text-slate-400 mb-3">
                          This call was recorded before the start event capture update. Only WebSocket HTTP headers are available.
                        </p>
                        <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200">
                                <th className="text-left px-4 py-2 font-medium text-slate-600 w-1/3">Header</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-600">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(raw).map(([key, value], idx) => (
                                <tr key={key} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                                  <td className="px-4 py-2 font-mono text-xs text-slate-700 font-medium">{key}</td>
                                  <td className="px-4 py-2 font-mono text-xs text-slate-600 break-all">{String(value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-2">No Waybeo call data recorded for this call.</p>
                <p className="text-xs text-slate-400">Start event data is captured when Waybeo initiates the WebSocket connection.</p>
              </div>
            )}
          </Card>
        )}

        {/* SI Payload Tab */}
        {activeTab === "siPayload" && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">SI Payload (Sent to Webhook)</h3>
            {call.payloadJson ? (
              <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-slate-100 font-mono whitespace-pre-wrap">
                  {JSON.stringify(call.payloadJson, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">
                No SI payload available for this call.
              </p>
            )}

            {/* SI Webhook API Response */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">SI Webhook API Response</h4>
              {call.siWebhookResponse ? (
                <div className={`rounded-lg border ${
                  call.siWebhookResponse.success
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-red-50 border-red-200"
                }`}>
                  <div className="flex items-center gap-3 p-3 border-b border-inherit">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                      call.siWebhookResponse.success
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {call.siWebhookResponse.success ? "✅ Success" : "❌ Failed"}
                    </span>
                    <span className="text-sm font-mono text-slate-600">
                      HTTP {call.siWebhookResponse.status_code}
                    </span>
                  </div>
                  <div className="p-3">
                    <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap break-all">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(call.siWebhookResponse.response_body), null, 2);
                        } catch {
                          return call.siWebhookResponse.response_body;
                        }
                      })()}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-center">
                  <p className="text-slate-400 text-sm">No SI webhook response recorded.</p>
                </div>
              )}
            </div>

            {call.analyticsJson && (
              <div className="mt-6 pt-6 border-t border-slate-200">
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

        {/* Waybeo Payload Tab */}
        {activeTab === "waybeoPayload" && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Waybeo Payload (Sent to Webhook)</h3>
            {call.waybeoPayloadJson ? (
              <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-slate-100 font-mono whitespace-pre-wrap">
                  {JSON.stringify(call.waybeoPayloadJson, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">
                No Waybeo payload available for this call.
              </p>
            )}

            {/* Waybeo Webhook API Response */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Waybeo Webhook API Response</h4>
              {call.waybeoWebhookResponse ? (
                <div className={`rounded-lg border ${
                  call.waybeoWebhookResponse.success
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-red-50 border-red-200"
                }`}>
                  <div className="flex items-center gap-3 p-3 border-b border-inherit">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                      call.waybeoWebhookResponse.success
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {call.waybeoWebhookResponse.success ? "✅ Success" : "❌ Failed"}
                    </span>
                    <span className="text-sm font-mono text-slate-600">
                      HTTP {call.waybeoWebhookResponse.status_code}
                    </span>
                  </div>
                  <div className="p-3">
                    <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap break-all">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(call.waybeoWebhookResponse.response_body), null, 2);
                        } catch {
                          return call.waybeoWebhookResponse.response_body;
                        }
                      })()}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-center">
                  <p className="text-slate-400 text-sm">No Waybeo webhook response recorded.</p>
                </div>
              )}
            </div>

            {/* Call Control Event (Hangup/Transfer) */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Call Control Event</h4>
              {call.callControlEvent ? (
                <div className={`p-4 rounded-lg border ${
                  call.callControlEvent.type === "transfer" 
                    ? "bg-violet-50 border-violet-200" 
                    : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                      call.callControlEvent.type === "transfer"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {call.callControlEvent.type === "transfer" ? "🔀 Transfer" : "📞 Hangup"}
                    </span>
                    {call.callControlEvent.status && (
                      <span className="text-xs text-slate-500">
                        Status: {call.callControlEvent.status}
                      </span>
                    )}
                  </div>
                  {call.callControlEvent.reason && (
                    <p className="text-sm text-slate-700 mb-2">
                      <span className="font-medium">Reason:</span> {call.callControlEvent.reason}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    <span className="font-medium">Timestamp:</span>{" "}
                    {new Date(call.callControlEvent.timestamp).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "medium",
                    })}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-center">
                  <p className="text-slate-400 text-sm">
                    No hangup or transfer event recorded for this call.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
