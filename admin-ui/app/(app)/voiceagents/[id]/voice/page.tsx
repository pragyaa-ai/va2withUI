"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";

export default function VoicePage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    voiceName: "",
    accentNotes: "",
    settingsJson: "",
  });

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}/voice`)
      .then((r) => r.json())
      .then((data) => {
        setForm({
          voiceName: data.voiceName || "",
          accentNotes: data.accentNotes || "",
          settingsJson: data.settingsJson ? JSON.stringify(data.settingsJson, null, 2) : "",
        });
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    let settingsJson = null;
    if (form.settingsJson.trim()) {
      try {
        settingsJson = JSON.parse(form.settingsJson);
      } catch {
        alert("Invalid JSON in advanced settings");
        setSaving(false);
        return;
      }
    }
    await fetch(`/api/voiceagents/${params.id}/voice`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceName: form.voiceName,
        accentNotes: form.accentNotes,
        settingsJson,
      }),
    });
    setSaving(false);
  };

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">Voice Profile</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Voice Name</label>
          <Input
            value={form.voiceName}
            onChange={(e) => setForm({ ...form, voiceName: e.target.value })}
            placeholder="e.g. Ananya"
          />
          <p className="mt-1 text-xs text-slate-400">
            Display name for the voice used by this VoiceAgent.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Accent Notes</label>
          <Textarea
            value={form.accentNotes}
            onChange={(e) => setForm({ ...form, accentNotes: e.target.value })}
            rows={3}
            placeholder="e.g. North Indian, formal tone..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Advanced Settings (JSON)
          </label>
          <Textarea
            value={form.settingsJson}
            onChange={(e) => setForm({ ...form, settingsJson: e.target.value })}
            rows={5}
            placeholder='{}'
            className="font-mono text-xs"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Voice Profile"}
          </Button>
        </div>
      </Card>
    </div>
  );
}



