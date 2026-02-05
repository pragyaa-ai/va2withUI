"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Call {
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
  extractedData?: {
    full_name?: string;
    car_model?: string;
    email_id?: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function CallsListPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calls, setCalls] = useState<Call[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({
    outcome: searchParams.get("outcome") || "",
    sentiment: searchParams.get("sentiment") || "",
    startDate: searchParams.get("startDate") || "",
    endDate: searchParams.get("endDate") || "",
    storeCode: searchParams.get("storeCode") || "",
    carModel: searchParams.get("carModel") || "",
    testDrive: searchParams.get("testDrive") || "",
  });

  const page = parseInt(searchParams.get("page") || "1", 10);

  const fetchCalls = async () => {
    setLoading(true);
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: "20",
    });
    if (filters.outcome) queryParams.set("outcome", filters.outcome);
    if (filters.sentiment) queryParams.set("sentiment", filters.sentiment);
    if (filters.startDate) queryParams.set("startDate", filters.startDate);
    if (filters.endDate) queryParams.set("endDate", filters.endDate);
    if (filters.storeCode) queryParams.set("storeCode", filters.storeCode);
    if (filters.carModel) queryParams.set("carModel", filters.carModel);
    if (filters.testDrive) queryParams.set("testDrive", filters.testDrive);

    const res = await fetch(`/api/voiceagents/${params.id}/calls?${queryParams}`);
    const data = await res.json();
    setCalls(data.calls || []);
    setPagination(data.pagination);
    setLoading(false);
  };

  useEffect(() => {
    fetchCalls();
  }, [params.id, page, filters]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/voiceagents/${params.id}/calls/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.synced > 0) {
        fetchCalls();
      }
      alert(`Synced: ${data.synced}, Skipped: ${data.skipped}, Errors: ${data.errors}`);
    } catch (error) {
      console.error("Sync error:", error);
      alert("Failed to sync calls");
    }
    setSyncing(false);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const getSentimentBadge = (sentiment?: string) => {
    const styles: Record<string, string> = {
      POSITIVE: "bg-emerald-100 text-emerald-700",
      NEUTRAL: "bg-slate-100 text-slate-700",
      NEGATIVE: "bg-red-100 text-red-700",
    };
    if (!sentiment) return <span className="text-slate-400">-</span>;
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[sentiment] || styles.NEUTRAL}`}>
        {sentiment.toLowerCase()}
      </span>
    );
  };

  const getOutcomeBadge = (outcome?: string) => {
    const styles: Record<string, string> = {
      COMPLETE: "bg-emerald-100 text-emerald-700",
      PARTIAL: "bg-amber-100 text-amber-700",
      INCOMPLETE: "bg-red-100 text-red-700",
      TRANSFERRED: "bg-violet-100 text-violet-700",
    };
    if (!outcome) return <span className="text-slate-400">-</span>;
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[outcome] || "bg-slate-100 text-slate-700"}`}>
        {outcome.toLowerCase()}
      </span>
    );
  };

  const applyFilters = () => {
    const queryParams = new URLSearchParams();
    if (filters.outcome) queryParams.set("outcome", filters.outcome);
    if (filters.sentiment) queryParams.set("sentiment", filters.sentiment);
    if (filters.startDate) queryParams.set("startDate", filters.startDate);
    if (filters.endDate) queryParams.set("endDate", filters.endDate);
    if (filters.storeCode) queryParams.set("storeCode", filters.storeCode);
    if (filters.carModel) queryParams.set("carModel", filters.carModel);
    if (filters.testDrive) queryParams.set("testDrive", filters.testDrive);
    router.push(`/voiceagents/${params.id}/calls?${queryParams}`);
  };

  const clearFilters = () => {
    setFilters({ outcome: "", sentiment: "", startDate: "", endDate: "", storeCode: "", carModel: "", testDrive: "" });
    router.push(`/voiceagents/${params.id}/calls`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Call History</h1>
          <p className="text-sm text-slate-500 mt-1">
            {pagination?.total || 0} total calls
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync from Queue Processor"}
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Store Code</label>
            <input
              type="text"
              placeholder="e.g. 10001"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm w-24"
              value={filters.storeCode}
              onChange={(e) => setFilters({ ...filters, storeCode: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Car Model</label>
            <input
              type="text"
              placeholder="e.g. Seltos"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm w-28"
              value={filters.carModel}
              onChange={(e) => setFilters({ ...filters, carModel: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Test Drive</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filters.testDrive}
              onChange={(e) => setFilters({ ...filters, testDrive: e.target.value })}
            >
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filters.outcome}
              onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}
            >
              <option value="">All</option>
              <option value="COMPLETE">Complete</option>
              <option value="PARTIAL">Partial</option>
              <option value="INCOMPLETE">Incomplete</option>
              <option value="TRANSFERRED">Transferred</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Sentiment</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filters.sentiment}
              onChange={(e) => setFilters({ ...filters, sentiment: e.target.value })}
            >
              <option value="">All</option>
              <option value="POSITIVE">Positive</option>
              <option value="NEUTRAL">Neutral</option>
              <option value="NEGATIVE">Negative</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
            <input
              type="date"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
            <input
              type="date"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
          <Button onClick={applyFilters}>Apply</Button>
          <button
            onClick={clearFilters}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        </div>
      </Card>

      {/* Calls Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : calls.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-400">No calls found.</p>
            <p className="text-sm text-slate-400 mt-1">
              Try syncing from the queue processor or adjusting your filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Date & Time</th>
                  <th className="px-4 py-3 font-medium">Call ID</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium">Sentiment</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr
                    key={call.id}
                    className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/voiceagents/${params.id}/calls/${call.callId || call.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {new Date(call.startedAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(call.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                      {call.callId ? call.callId.slice(-8) : call.id.slice(-8)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {call.durationSec ? formatDuration(call.durationSec) : "-"}
                    </td>
                    <td className="px-4 py-3">{getOutcomeBadge(call.outcome)}</td>
                    <td className="px-4 py-3">{getSentimentBadge(call.sentiment)}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">
                        {call.extractedData?.full_name || <span className="text-slate-400">-</span>}
                      </div>
                      {call.extractedData?.car_model && (
                        <div className="text-xs text-slate-500">{call.extractedData.car_model}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-slate-600 truncate">
                        {call.summary || <span className="text-slate-400 italic">No summary</span>}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * pagination.limit + 1} to{" "}
              {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push(`/voiceagents/${params.id}/calls?page=${page - 1}`)}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => router.push(`/voiceagents/${params.id}/calls?page=${page + 1}`)}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
