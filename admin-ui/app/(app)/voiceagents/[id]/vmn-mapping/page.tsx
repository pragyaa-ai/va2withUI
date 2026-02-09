"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

interface VmnMapping {
  id: string;
  vmn: string;
  storeCode: string;
  effectiveFrom: string;
  createdAt: string;
  updatedAt: string;
}

export default function VmnMappingPage() {
  const params = useParams();
  const [mappings, setMappings] = useState<VmnMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ vmn: "", storeCode: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadMappings = useCallback(async () => {
    try {
      const res = await fetch(`/api/voiceagents/${params.id}/vmn-mappings`);
      if (res.ok) {
        const data = await res.json();
        setMappings(data);
      }
    } catch (err) {
      console.error("Failed to load VMN mappings:", err);
    }
  }, [params.id]);

  useEffect(() => {
    loadMappings().finally(() => setLoading(false));
  }, [loadMappings]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/voiceagents/${params.id}/vmn-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setForm({ vmn: "", storeCode: "" });
        setShowForm(false);
        await loadMappings();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add mapping");
      }
    } catch {
      setError("Failed to add mapping");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (mappingId: string) => {
    if (!confirm("Are you sure you want to delete this VMN mapping?")) return;
    setDeletingId(mappingId);

    try {
      const res = await fetch(
        `/api/voiceagents/${params.id}/vmn-mappings/${mappingId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await loadMappings();
      }
    } catch (err) {
      console.error("Failed to delete mapping:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const filteredMappings = mappings.filter(
    (m) =>
      m.vmn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.storeCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading VMN mappings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 bg-gradient-to-br from-violet-50 to-white border-violet-100">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">VMN to Store Code Mapping</h2>
            <p className="text-sm text-slate-500 mt-1">
              Map Virtual Mobile Numbers (VMN) to dealer/store codes. When a customer dials a Kia
              number, the store code is automatically derived from this mapping.
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-violet-600">{mappings.length}</div>
            <div className="text-xs text-slate-500">Active Mappings</div>
          </div>
        </div>
      </Card>

      {/* Actions Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="Search by VMN or Store Code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={() => { setShowForm(!showForm); setError(null); }}>
          {showForm ? "Cancel" : "+ Add VMN Mapping"}
        </Button>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card className="p-6 border-violet-200 bg-violet-50/30">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">New VMN Mapping</h3>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  VMN (Virtual Mobile Number)
                </label>
                <Input
                  value={form.vmn}
                  onChange={(e) => setForm({ ...form, vmn: e.target.value })}
                  placeholder="+919167243969"
                  required
                />
                <p className="mt-1 text-xs text-slate-400">
                  The Kia number customers dial (include country code)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Store Code</label>
                <Input
                  value={form.storeCode}
                  onChange={(e) => setForm({ ...form, storeCode: e.target.value })}
                  placeholder="UP510"
                  required
                />
                <p className="mt-1 text-xs text-slate-400">
                  Dealer/store identifier code
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Adding..." : "Add Mapping"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Mappings Table */}
      {filteredMappings.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          {searchTerm ? "No mappings match your search." : "No VMN mappings configured yet. Add one above."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">#</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">VMN</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Store Code</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Effective From</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map((m, idx) => (
                  <tr
                    key={m.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-medium text-slate-900">{m.vmn}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                        {m.storeCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(m.effectiveFrom)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDateTime(m.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(m.id)}
                        disabled={deletingId === m.id}
                        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
                      >
                        {deletingId === m.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Info Box */}
      <Card className="p-5 bg-amber-50 border-amber-100">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="text-sm text-amber-800">
            <p className="font-medium">How it works</p>
            <p className="mt-1">
              When a customer calls a VMN listed here, the telephony service automatically maps it
              to the corresponding store code. New mappings become effective immediately for all
              subsequent calls. The &quot;Effective From&quot; timestamp shows when each mapping was activated.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
