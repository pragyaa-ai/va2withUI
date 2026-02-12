"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { VOICE_NAMES, ACCENTS, LANGUAGES, ENGINE_LABELS } from "@/lib/validation";
import AttemptsAnalytics from "@/components/analytics/AttemptsAnalytics";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface VoiceAgent {
  id: string;
  name: string;
  phoneNumber?: string;
  engine: keyof typeof ENGINE_LABELS;
  greeting: string;
  accent: keyof typeof ACCENTS;
  language: keyof typeof LANGUAGES;
  voiceName: keyof typeof VOICE_NAMES;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { sessions: number; feedback: number };
}

interface Analytics {
  summary: {
    totalCalls: number;
    totalMinutes: number;
    avgDuration: number;
    dataCaptureRate: number;
    callsTrend: number;
  };
  chartData: Array<{ date: string; calls: number; minutes: number }>;
  outcomeDistribution: {
    complete: number;
    partial: number;
    incomplete: number;
    transferred: number;
  };
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
    unknown: number;
  };
  storeCodeDistribution?: Record<string, number>;
  carModelDistribution?: Record<string, number>;
  testDriveDistribution?: { yes: number; no: number; unknown: number };
}

interface RecentCall {
  id: string;
  callId?: string;
  startedAt: string;
  durationSec?: number;
  outcome?: string;
  sentiment?: string;
  summary?: string;
  fromNumber?: string;
}

const OUTCOME_COLORS = {
  complete: "#10b981",
  partial: "#f59e0b",
  incomplete: "#ef4444",
  transferred: "#8b5cf6",
};

const SENTIMENT_COLORS = {
  positive: "#10b981",
  neutral: "#6b7280",
  negative: "#ef4444",
  unknown: "#cbd5e1",
};

export default function VoiceAgentOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [filters, setFilters] = useState({
    storeCode: "",
    carModel: "",
    testDrive: "",
  });

  useEffect(() => {
    // Build analytics URL with period or custom date range
    const urlParams = new URLSearchParams();
    if (period === "custom" && customRange.start && customRange.end) {
      urlParams.set("startDate", customRange.start);
      urlParams.set("endDate", customRange.end);
    } else {
      urlParams.set("period", period);
    }
    if (filters.storeCode) urlParams.set("storeCode", filters.storeCode);
    if (filters.carModel) urlParams.set("carModel", filters.carModel);
    if (filters.testDrive) urlParams.set("testDrive", filters.testDrive);

    const analyticsUrl = `/api/voiceagents/${params.id}/analytics?${urlParams}`;
    const callsUrl = `/api/voiceagents/${params.id}/calls?limit=5&${urlParams}`;

    Promise.all([
      fetch(`/api/voiceagents/${params.id}`).then((r) => r.json()),
      fetch(analyticsUrl).then((r) => r.json()),
      fetch(callsUrl).then((r) => r.json()),
    ])
      .then(([agentData, analyticsData, callsData]) => {
        setAgent(agentData);
        setAnalytics(analyticsData);
        setRecentCalls(callsData.calls || []);
      })
      .finally(() => setLoading(false));
  }, [params.id, period, customRange.start, customRange.end, filters.storeCode, filters.carModel, filters.testDrive]);

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
    if (!sentiment) return null;
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
    if (!outcome) return null;
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[outcome] || "bg-slate-100 text-slate-700"}`}>
        {outcome.toLowerCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="space-y-4 w-full max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!agent) return <p className="text-red-500">VoiceAgent not found</p>;

  const outcomeData = analytics ? [
    { name: "Complete", value: analytics.outcomeDistribution.complete, color: OUTCOME_COLORS.complete },
    { name: "Partial", value: analytics.outcomeDistribution.partial, color: OUTCOME_COLORS.partial },
    { name: "Incomplete", value: analytics.outcomeDistribution.incomplete, color: OUTCOME_COLORS.incomplete },
    { name: "Transferred", value: analytics.outcomeDistribution.transferred, color: OUTCOME_COLORS.transferred },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-8">
      {/* Period Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Analytics Overview</h2>
        <div className="flex flex-wrap items-center gap-2">
          {["today", "7d", "30d", "90d", "all"].map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                setCustomRange({ start: "", end: "" });
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                period === p && !customRange.start
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p === "all" ? "All Time" : p === "today" ? "Today" : p.replace("d", " Days")}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customRange.start}
              onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
              className="px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
              placeholder="From"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customRange.end}
              onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
              className="px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
              placeholder="To"
            />
            {customRange.start && customRange.end && (
              <button
                onClick={() => setPeriod("custom")}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  period === "custom"
                    ? "bg-indigo-600 text-white"
                    : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                }`}
              >
                Apply
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters Row */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Store Code</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[140px]"
              value={filters.storeCode}
              onChange={(e) => setFilters({ ...filters, storeCode: e.target.value })}
            >
              <option value="">All Stores</option>
              {analytics?.storeCodeDistribution && Object.keys(analytics.storeCodeDistribution).map((code) => (
                <option key={code} value={code}>{code} ({analytics.storeCodeDistribution?.[code]})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Car Model</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[140px]"
              value={filters.carModel}
              onChange={(e) => setFilters({ ...filters, carModel: e.target.value })}
            >
              <option value="">All Models</option>
              {analytics?.carModelDistribution && Object.keys(analytics.carModelDistribution).map((model) => (
                <option key={model} value={model}>{model} ({analytics.carModelDistribution?.[model]})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Test Drive</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[120px]"
              value={filters.testDrive}
              onChange={(e) => setFilters({ ...filters, testDrive: e.target.value })}
            >
              <option value="">All</option>
              <option value="yes">Yes ({analytics?.testDriveDistribution?.yes || 0})</option>
              <option value="no">No ({analytics?.testDriveDistribution?.no || 0})</option>
            </select>
          </div>
          {(filters.storeCode || filters.carModel || filters.testDrive) && (
            <button
              onClick={() => setFilters({ storeCode: "", carModel: "", testDrive: "" })}
              className="text-sm text-slate-500 hover:text-slate-700 px-2 py-2"
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {/* Stats Cards Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 bg-gradient-to-br from-indigo-50 via-white to-indigo-50/30 border-indigo-100/50 shadow-lg shadow-indigo-100/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Calls</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{analytics?.summary.totalCalls || 0}</p>
              {analytics?.summary.callsTrend != null && analytics.summary.callsTrend !== 0 && (
                <p className={`text-xs mt-1 font-medium ${analytics.summary.callsTrend > 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {analytics.summary.callsTrend > 0 ? "↑" : "↓"} {Math.abs(analytics.summary.callsTrend)}% vs prev
                </p>
              )}
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30 border-emerald-100/50 shadow-lg shadow-emerald-100/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Minutes</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{analytics?.summary.totalMinutes.toFixed(1) || 0}</p>
              <p className="text-xs mt-1 text-slate-500">Billable time</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-amber-50 via-white to-amber-50/30 border-amber-100/50 shadow-lg shadow-amber-100/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avg Duration</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{formatDuration(analytics?.summary.avgDuration || 0)}</p>
              <p className="text-xs mt-1 text-slate-500">Per call</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-violet-50 via-white to-violet-50/30 border-violet-100/50 shadow-lg shadow-violet-100/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Data Capture</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{analytics?.summary.dataCaptureRate || 0}%</p>
              <p className="text-xs mt-1 text-slate-500">Success rate</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calls by Date Chart */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Calls & Minutes by Date</h3>
          {analytics?.chartData && analytics.chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={analytics.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                  labelFormatter={(value) => new Date(value).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="calls"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#colorCalls)"
                  name="Calls"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="minutes"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#colorMinutes)"
                  name="Minutes"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400">
              No call data available for this period
            </div>
          )}
        </Card>

        {/* Outcome Distribution */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Call Outcomes</h3>
          {outcomeData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={outcomeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {outcomeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {outcomeData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-slate-600">{entry.name}</span>
                    <span className="font-medium text-slate-900">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400">
              No outcome data available
            </div>
          )}
        </Card>
      </div>

      {/* Additional Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Store Code Distribution */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">By Store Code</h3>
          {analytics?.storeCodeDistribution && Object.keys(analytics.storeCodeDistribution).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart 
                data={Object.entries(analytics.storeCodeDistribution)
                  .filter(([name]) => name && name.trim() !== "")
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 5)
                  .map(([name, value]) => ({ name, value }))}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: "#64748b" }} 
                  width={70}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
              No store data available
            </div>
          )}
        </Card>

        {/* Car Model Distribution */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">By Car Model</h3>
          {analytics?.carModelDistribution && Object.keys(analytics.carModelDistribution).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart 
                data={Object.entries(analytics.carModelDistribution)
                  .filter(([name]) => name && name.trim() !== "" && name !== "/")
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 5)
                  .map(([name, value]) => ({ name: name.length > 12 ? name.slice(0, 12) + "..." : name, value }))}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: "#64748b" }} 
                  width={90}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
              No car model data available
            </div>
          )}
        </Card>

        {/* Test Drive Distribution */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Test Drive Interest</h3>
          {analytics?.testDriveDistribution && (analytics.testDriveDistribution.yes > 0 || analytics.testDriveDistribution.no > 0) ? (
            <div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Yes", value: analytics.testDriveDistribution.yes, color: "#10b981" },
                      { name: "No", value: analytics.testDriveDistribution.no, color: "#ef4444" },
                      { name: "Unknown", value: analytics.testDriveDistribution.unknown, color: "#cbd5e1" },
                    ].filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {[
                      { color: "#10b981" },
                      { color: "#ef4444" },
                      { color: "#cbd5e1" },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-600">Yes</span>
                  <span className="font-medium text-slate-900">{analytics.testDriveDistribution.yes}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-slate-600">No</span>
                  <span className="font-medium text-slate-900">{analytics.testDriveDistribution.no}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
              No test drive data available
            </div>
          )}
        </Card>
      </div>

      {/* Recent Calls Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Recent Calls</h3>
          <Link
            href={`/voiceagents/${params.id}/calls`}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            View all calls →
          </Link>
        </div>
        {recentCalls.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-3 pr-4 font-medium">Date</th>
                  <th className="py-3 pr-4 font-medium">Duration</th>
                  <th className="py-3 pr-4 font-medium">Outcome</th>
                  <th className="py-3 pr-4 font-medium">Sentiment</th>
                  <th className="py-3 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call) => (
                  <tr
                    key={call.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/voiceagents/${params.id}/calls/${call.callId || call.id}`)}
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-900">
                        {new Date(call.startedAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(call.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {call.durationSec ? formatDuration(call.durationSec) : "-"}
                    </td>
                    <td className="py-3 pr-4">{getOutcomeBadge(call.outcome)}</td>
                    <td className="py-3 pr-4">{getSentimentBadge(call.sentiment)}</td>
                    <td className="py-3 max-w-xs truncate text-slate-600">
                      {call.summary || <span className="text-slate-400 italic">No summary</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <p>No calls recorded yet.</p>
            <p className="text-xs mt-1">Calls will appear here as they are processed.</p>
          </div>
        )}
      </Card>

      {/* Data Capture Attempts Analytics */}
      <div className="pt-8 border-t border-slate-200">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Data Capture Attempts</h2>
        <p className="text-sm text-slate-500 mb-6">
          Track how many attempts are needed to capture each data point and identify areas for improvement
        </p>
        <AttemptsAnalytics
          voiceAgentId={params.id as string}
          startDate={period === "custom" ? customRange.start : undefined}
          endDate={period === "custom" ? customRange.end : undefined}
        />
      </div>

    </div>
  );
}
