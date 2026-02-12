"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface AttemptStats {
  overallStats: {
    totalFields: number;
    totalCalls: number;
    firstAttemptSuccess: number;
    firstAttemptRate: number;
    secondAttemptSuccess: number;
    secondAttemptRate: number;
    thirdPlusAttemptSuccess: number;
    thirdPlusAttemptRate: number;
    notCaptured: number;
    notCapturedRate: number;
    overallCaptureRate: number;
  };
  fieldStats: Array<{
    fieldName: string;
    total: number;
    firstAttempt: number;
    firstAttemptRate: number;
    secondAttempt: number;
    secondAttemptRate: number;
    thirdPlusAttempt: number;
    thirdPlusAttemptRate: number;
    notCaptured: number;
    notCapturedRate: number;
    captureRate: number;
  }>;
}

interface AttemptsAnalyticsProps {
  voiceAgentId: string;
  startDate?: string;
  endDate?: string;
}

export default function AttemptsAnalytics({ voiceAgentId, startDate, endDate }: AttemptsAnalyticsProps) {
  const [stats, setStats] = useState<AttemptStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ voiceAgentId });
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);

        const res = await fetch(`/api/analytics/attempts?${params}`);
        const data = await res.json();
        setStats(data);
      } catch (error) {
        console.error("Error fetching attempt stats:", error);
      }
      setLoading(false);
    };

    fetchStats();
  }, [voiceAgentId, startDate, endDate]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="p-6">
        <p className="text-slate-400 text-center">Unable to load attempt analytics</p>
      </Card>
    );
  }

  const { overallStats, fieldStats } = stats;

  // Prepare chart data
  const chartData = fieldStats.map((field) => ({
    field: field.fieldName,
    "1st Attempt": field.firstAttemptRate,
    "2nd Attempt": field.secondAttemptRate,
    "3+ Attempts": field.thirdPlusAttemptRate,
    "Not Captured": field.notCapturedRate,
  }));

  return (
    <div className="space-y-6">
      {/* Overall Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500 uppercase mb-1">Overall Capture Rate</p>
          <p className="text-3xl font-bold text-emerald-600">{overallStats.overallCaptureRate}%</p>
          <p className="text-xs text-slate-500 mt-1">
            {overallStats.totalFields - overallStats.notCaptured} of {overallStats.totalFields} fields
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500 uppercase mb-1">1st Attempt Success</p>
          <p className="text-3xl font-bold text-green-600">{overallStats.firstAttemptRate}%</p>
          <p className="text-xs text-slate-500 mt-1">
            {overallStats.firstAttemptSuccess} fields captured on first try
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500 uppercase mb-1">2nd Attempt Rate</p>
          <p className="text-3xl font-bold text-yellow-600">{overallStats.secondAttemptRate}%</p>
          <p className="text-xs text-slate-500 mt-1">
            {overallStats.secondAttemptSuccess} fields needed a second try
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500 uppercase mb-1">3+ Attempts</p>
          <p className="text-3xl font-bold text-red-600">{overallStats.thirdPlusAttemptRate}%</p>
          <p className="text-xs text-slate-500 mt-1">
            {overallStats.thirdPlusAttemptSuccess} fields needed 3+ tries
          </p>
        </Card>
      </div>

      {/* Field-Level Breakdown Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Data Capture Attempts by Field</h3>
        <p className="text-sm text-slate-500 mb-6">
          Breakdown of how many attempts were needed to capture each data point across {overallStats.totalCalls} calls
        </p>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} label={{ value: "Percentage (%)", position: "insideBottom", offset: -5 }} />
              <YAxis type="category" dataKey="field" width={100} />
              <Tooltip />
              <Legend />
              <Bar dataKey="1st Attempt" stackId="a" fill="#10b981" />
              <Bar dataKey="2nd Attempt" stackId="a" fill="#f59e0b" />
              <Bar dataKey="3+ Attempts" stackId="a" fill="#ef4444" />
              <Bar dataKey="Not Captured" stackId="a" fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Field Stats Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Detailed Field Statistics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium text-slate-600">Field</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Total</th>
                <th className="text-center py-3 px-4 font-medium text-green-600">1st Attempt</th>
                <th className="text-center py-3 px-4 font-medium text-yellow-600">2nd Attempt</th>
                <th className="text-center py-3 px-4 font-medium text-red-600">3+ Attempts</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Not Captured</th>
                <th className="text-center py-3 px-4 font-medium text-emerald-600">Capture Rate</th>
              </tr>
            </thead>
            <tbody>
              {fieldStats.map((field, idx) => (
                <tr key={field.fieldName} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="py-3 px-4 font-medium text-slate-900 capitalize">{field.fieldName}</td>
                  <td className="py-3 px-4 text-center text-slate-700">{field.total}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-medium text-green-600">{field.firstAttempt}</span>
                      <span className="text-xs text-slate-500">({field.firstAttemptRate}%)</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-medium text-yellow-600">{field.secondAttempt}</span>
                      <span className="text-xs text-slate-500">({field.secondAttemptRate}%)</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-medium text-red-600">{field.thirdPlusAttempt}</span>
                      <span className="text-xs text-slate-500">({field.thirdPlusAttemptRate}%)</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-medium text-slate-600">{field.notCaptured}</span>
                      <span className="text-xs text-slate-500">({field.notCapturedRate}%)</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      field.captureRate >= 80
                        ? "bg-green-100 text-green-700"
                        : field.captureRate >= 60
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {field.captureRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Insights & Recommendations */}
      <Card className="p-6 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
        <h3 className="text-lg font-semibold text-indigo-900 mb-3">💡 Insights & Recommendations</h3>
        <div className="space-y-2 text-sm text-indigo-800">
          {overallStats.firstAttemptRate < 70 && (
            <p>
              • 1st attempt success rate is below 70%. Consider reviewing unclear audio, pronunciation issues, or
              improving system instructions for these fields.
            </p>
          )}
          {overallStats.thirdPlusAttemptRate > 15 && (
            <p>
              • More than 15% of fields require 3+ attempts. Check the Human Review tab to identify patterns and
              add corrections to the knowledge pool.
            </p>
          )}
          {fieldStats.some((f) => f.notCapturedRate > 20) && (
            <p>
              • Some fields have high "Not Captured" rates. Review calls to understand why customers aren't providing
              this information or if the agent is not asking effectively.
            </p>
          )}
          {overallStats.overallCaptureRate >= 85 && (
            <p>✅ Excellent performance! Your overall capture rate is above 85%.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
