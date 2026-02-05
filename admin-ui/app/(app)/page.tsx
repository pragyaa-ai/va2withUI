"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface DashboardStats {
  counts: {
    voiceAgents: number;
    totalCalls: number;
    feedback: number;
  };
  stats: {
    callsLast30Days: number;
    totalMinutes: number;
    avgDuration: number;
    dataCaptureRate: number;
  };
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
  };
  chartData: Array<{ date: string; calls: number }>;
}

const OUTCOME_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#6366f1"];
const SENTIMENT_COLORS = ["#10b981", "#94a3b8", "#ef4444"];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const outcomeData = stats
    ? [
        { name: "Complete", value: stats.outcomeDistribution.complete },
        { name: "Partial", value: stats.outcomeDistribution.partial },
        { name: "Incomplete", value: stats.outcomeDistribution.incomplete },
        { name: "Transferred", value: stats.outcomeDistribution.transferred },
      ].filter((d) => d.value > 0)
    : [];

  const sentimentData = stats
    ? [
        { name: "Positive", value: stats.sentimentDistribution.positive },
        { name: "Neutral", value: stats.sentimentDistribution.neutral },
        { name: "Negative", value: stats.sentimentDistribution.negative },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.05%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30" />
        <div className="relative">
          <h1 className="text-3xl font-bold">Welcome to VoiceAgent Admin</h1>
          <p className="mt-2 text-indigo-100 max-w-xl">
            Configure your AI voice assistants, manage call flows, set guardrails, and track performance.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/voiceagents">
              <Button className="bg-white/10 text-white border border-white/30 hover:bg-white hover:text-indigo-700 transition-all">
                View VoiceAgents
              </Button>
            </Link>
            <Link href="/voiceagents/new">
              <Button className="bg-indigo-500 text-white hover:bg-indigo-400 border-indigo-400">
                + Create New
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">VoiceAgents</p>
              <p className="text-2xl font-bold text-slate-900">
                {loading ? "—" : stats?.counts.voiceAgents || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Calls</p>
              <p className="text-2xl font-bold text-slate-900">
                {loading ? "—" : stats?.counts.totalCalls || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Feedback Items</p>
              <p className="text-2xl font-bold text-slate-900">
                {loading ? "—" : stats?.counts.feedback || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Performance Stats - Last 30 Days */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Calls (30 days)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {loading ? "—" : stats?.stats.callsLast30Days || 0}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Total Minutes</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {loading ? "—" : `${stats?.stats.totalMinutes || 0} min`}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Avg Duration</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {loading ? "—" : `${stats?.stats.avgDuration || 0}s`}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Data Capture Rate</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {loading ? "—" : `${stats?.stats.dataCaptureRate || 0}%`}
          </p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calls by Date */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Calls by Date (Last 14 Days)</h3>
          {stats?.chartData && stats.chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="calls" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400">
              No call data available
            </div>
          )}
        </Card>

        {/* Call Outcomes */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Call Outcomes</h3>
          {outcomeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={outcomeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {outcomeData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={OUTCOME_COLORS[index % OUTCOME_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400">
              No outcome data available
            </div>
          )}
        </Card>
      </div>

      {/* Sentiment Distribution */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Sentiment Distribution</h3>
        {sentimentData.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {sentimentData.map((item, index) => (
              <div
                key={item.name}
                className="text-center p-4 rounded-xl"
                style={{ backgroundColor: `${SENTIMENT_COLORS[index]}15` }}
              >
                <p className="text-3xl font-bold" style={{ color: SENTIMENT_COLORS[index] }}>
                  {item.value}
                </p>
                <p className="text-sm text-slate-600 mt-1">{item.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[100px] flex items-center justify-center text-slate-400">
            No sentiment data available
          </div>
        )}
      </Card>
    </div>
  );
}
