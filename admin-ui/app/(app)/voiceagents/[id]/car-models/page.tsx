"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";

interface CarModel {
  id: string;
  modelName: string;
  pronunciation: string | null;
  phonetic: string | null;
  vehicleType: string | null;
  keyFeatures: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_FORM = {
  modelName: "",
  pronunciation: "",
  phonetic: "",
  vehicleType: "",
  keyFeatures: "",
  displayOrder: 0,
  isActive: true,
};

export default function CarModelsPage() {
  const params = useParams();
  const [models, setModels] = useState<CarModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/voiceagents/${params.id}/car-models`);
      if (res.ok) {
        const data = await res.json();
        setModels(data);
      }
    } catch (err) {
      console.error("Failed to load car models:", err);
    }
  }, [params.id]);

  useEffect(() => {
    loadModels().finally(() => setLoading(false));
  }, [loadModels]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/voiceagents/${params.id}/car-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          displayOrder: form.displayOrder || models.length,
        }),
      });

      if (res.ok) {
        setForm(EMPTY_FORM);
        setShowForm(false);
        await loadModels();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add car model");
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(
        `/api/voiceagents/${params.id}/car-models/${editingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      if (res.ok) {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowForm(false);
        await loadModels();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update car model");
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  };

  const handleEdit = (model: CarModel) => {
    setEditingId(model.id);
    setForm({
      modelName: model.modelName,
      pronunciation: model.pronunciation || "",
      phonetic: model.phonetic || "",
      vehicleType: model.vehicleType || "",
      keyFeatures: model.keyFeatures || "",
      displayOrder: model.displayOrder,
      isActive: model.isActive,
    });
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/voiceagents/${params.id}/car-models/${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await loadModels();
      }
    } catch (err) {
      console.error("Failed to delete car model:", err);
    }
    setDeletingId(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const filteredModels = models.filter(
    (m) =>
      m.modelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.vehicleType || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = models.filter((m) => m.isActive).length;

  if (loading) return <p className="text-slate-500">Loading car models...</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Car Models</h2>
          <p className="text-sm text-slate-500">
            {activeCount} active model{activeCount !== 1 ? "s" : ""} &middot;
            Auto-injected into system instructions with pronunciations and features
          </p>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setForm({ ...EMPTY_FORM, displayOrder: models.length });
          }}
        >
          + Add Model
        </Button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="p-6 border-indigo-200 bg-indigo-50/30">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">
            {editingId ? "Edit Car Model" : "Add New Car Model"}
          </h3>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={editingId ? handleUpdate : handleAdd} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Model Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.modelName}
                  onChange={(e) => setForm({ ...form, modelName: e.target.value })}
                  placeholder="e.g. SYROS"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Vehicle Type
                </label>
                <Input
                  value={form.vehicleType}
                  onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                  placeholder="e.g. New Age SUV"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Display Order
                </label>
                <Input
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })
                  }
                  min={0}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Pronunciation
                </label>
                <Input
                  value={form.pronunciation}
                  onChange={(e) => setForm({ ...form, pronunciation: e.target.value })}
                  placeholder="e.g. SIGH-ross"
                />
                <p className="mt-1 text-xs text-slate-400">How the agent should say the name</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phonetic (IPA)
                </label>
                <Input
                  value={form.phonetic}
                  onChange={(e) => setForm({ ...form, phonetic: e.target.value })}
                  placeholder="e.g. /ˈsaɪrɒs/"
                />
                <p className="mt-1 text-xs text-slate-400">International Phonetic Alphabet notation</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Key Features
              </label>
              <Textarea
                value={form.keyFeatures}
                onChange={(e) => setForm({ ...form, keyFeatures: e.target.value })}
                rows={4}
                placeholder={"1. Trinity Panoramic Display: 76.20 cm (30\") wide screen.\n2. Lounge Class Seating: Ventilated seats with reclining options.\n3. Advanced Safety: ADAS Level 2 with 16 autonomous features."}
              />
              <p className="mt-1 text-xs text-slate-400">
                Key specifications shared with the VoiceAgent when customer asks about this model
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span className="text-slate-700">Active</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" onClick={handleCancel} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.modelName.trim()}>
                {saving ? "Saving..." : editingId ? "Update Model" : "Add Model"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Search */}
      {models.length > 3 && (
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search models..."
          className="max-w-sm"
        />
      )}

      {/* Models Table */}
      {filteredModels.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-2 border-slate-200 bg-slate-50/50">
          <p className="text-sm text-slate-500">
            {models.length === 0
              ? "No car models configured. Add models to auto-inject them into the VoiceAgent system instructions."
              : "No models match your search."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredModels.map((model) => (
            <Card key={model.id} className={`transition-all ${!model.isActive ? "opacity-60" : ""}`}>
              {/* Model Header Row */}
              <div className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {model.modelName}
                    </span>
                    {model.vehicleType && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {model.vehicleType}
                      </span>
                    )}
                    {!model.isActive && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        Inactive
                      </span>
                    )}
                  </div>
                  {(model.pronunciation || model.phonetic) && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {model.pronunciation && <span>Say: &ldquo;{model.pronunciation}&rdquo;</span>}
                      {model.pronunciation && model.phonetic && <span> &middot; </span>}
                      {model.phonetic && <span className="font-mono">{model.phonetic}</span>}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {model.keyFeatures && (
                    <button
                      onClick={() =>
                        setExpandedId(expandedId === model.id ? null : model.id)
                      }
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {expandedId === model.id ? "Hide Features" : "Show Features"}
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(model)}
                    className="text-xs text-slate-500 hover:text-indigo-600 font-medium px-2 py-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(model.id)}
                    disabled={deletingId === model.id}
                    className="text-xs text-slate-400 hover:text-red-600 font-medium px-2 py-1"
                  >
                    {deletingId === model.id ? "..." : "Delete"}
                  </button>
                </div>
              </div>

              {/* Expanded Features */}
              {expandedId === model.id && model.keyFeatures && (
                <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-500 mb-2">Key Specifications:</p>
                  <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50 rounded-md p-3">
                    {model.keyFeatures}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Info Note */}
      <div className="rounded-md border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs text-blue-700">
        <strong>How it works:</strong> Active car models are automatically injected into the VoiceAgent&apos;s
        system instructions at call time. The agent will use correct pronunciations and can share
        key features when customers ask about specific models.
      </div>
    </div>
  );
}
