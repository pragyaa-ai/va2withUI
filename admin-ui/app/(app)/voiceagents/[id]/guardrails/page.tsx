"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";

interface Guardrail {
  id: string;
  name: string;
  description?: string;
  ruleText: string;
  enabled: boolean;
  createdAt: string;
}

export default function GuardrailsPage() {
  const params = useParams();
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", ruleText: "" });
  const [saving, setSaving] = useState(false);

  const loadGuardrails = async () => {
    const res = await fetch(`/api/voiceagents/${params.id}/guardrails`);
    const data = await res.json();
    setGuardrails(data);
  };

  useEffect(() => {
    loadGuardrails().finally(() => setLoading(false));
  }, [params.id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/voiceagents/${params.id}/guardrails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", description: "", ruleText: "" });
    setShowForm(false);
    await loadGuardrails();
    setSaving(false);
  };

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Guardrails</h2>
        <Button variant="secondary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add Guardrail"}
        </Button>
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rule</label>
              <Textarea
                value={form.ruleText}
                onChange={(e) => setForm({ ...form, ruleText: e.target.value })}
                rows={3}
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Adding..." : "Add Guardrail"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {guardrails.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">No guardrails yet.</Card>
      ) : (
        <div className="space-y-3">
          {guardrails.map((g) => (
            <Card key={g.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-slate-900">{g.name}</h3>
                  {g.description && (
                    <p className="text-sm text-slate-500 mt-0.5">{g.description}</p>
                  )}
                </div>
                <span
                  className={
                    "text-xs px-2 py-0.5 rounded-full " +
                    (g.enabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")
                  }
                >
                  {g.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded p-2">{g.ruleText}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}



