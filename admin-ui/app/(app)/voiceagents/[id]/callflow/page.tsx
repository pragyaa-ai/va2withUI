"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";

interface Step {
  id?: string;
  order: number;
  title: string;
  content: string;
  enabled: boolean;
}

export default function CallFlowPage() {
  const params = useParams();
  const [greeting, setGreeting] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}/callflow`)
      .then((r) => r.json())
      .then((data) => {
        setGreeting(data.greeting || "");
        setSteps(data.steps || []);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/voiceagents/${params.id}/callflow`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ greeting, steps }),
    });
    setSaving(false);
  };

  const addStep = () => {
    setSteps([...steps, { order: steps.length, title: "", content: "", enabled: true }]);
  };

  const updateStep = (idx: number, field: keyof Step, value: string | boolean) => {
    setSteps(steps.map((step, i) => 
      i === idx ? { ...step, [field]: value } : step
    ));
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  };

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Greeting</h2>
        <Textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          rows={3}
          placeholder="Hello! Welcome to Kia..."
        />
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Steps</h2>
          <Button variant="secondary" onClick={addStep}>+ Add Step</Button>
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-slate-500">No steps defined yet.</p>
        ) : (
          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-medium">#{idx + 1}</span>
                  <Input
                    value={step.title}
                    onChange={(e) => updateStep(idx, "title", e.target.value)}
                    placeholder="Step title"
                    className="flex-1"
                  />
                  <button
                    onClick={() => removeStep(idx)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <Textarea
                  value={step.content}
                  onChange={(e) => updateStep(idx, "content", e.target.value)}
                  placeholder="Step content/instructions..."
                  rows={2}
                />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={(e) => updateStep(idx, "enabled", e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Enabled
                </label>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Call Flow"}
        </Button>
      </div>
    </div>
  );
}



