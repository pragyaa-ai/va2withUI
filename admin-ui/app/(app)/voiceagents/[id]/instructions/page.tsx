"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { VOICE_NAMES, ACCENTS, LANGUAGES, ENGINE_LABELS } from "@/lib/validation";

// Default SI payload template
const DEFAULT_SI_TEMPLATE = {
  id: "bot_{call_id}",
  customer_name: "{agent_name}",
  call_ref_id: "{call_id}",
  call_vendor: "Waybeo",
  recording_url: "",
  start_time: "{start_time}",
  end_time: "{end_time}",
  duration: "{duration_sec}",
  store_code: "{store_code}",
  customer_number: "{customer_number}",
  language: {
    welcome: "hindi",
    conversational: "{detected_language}"
  },
  dealer_routing: {
    status: "{transfer_status}",
    reason: "{transfer_reason}",
    time: "{end_time}"
  },
  dropoff: {
    time: "{end_time}",
    action: "email"
  },
  completion_status: "{completion_status}",
  response_data: [
    {
      key_label: "What's your name",
      key_value: "name",
      key_response: "{extracted.name}",
      attempts: 1,
      remarks: "{extracted.name ? 'verified' : 'not_captured'}"
    },
    {
      key_label: "Which model you are looking for",
      key_value: "model",
      key_response: "{extracted.model}",
      attempts: 1,
      remarks: "{extracted.model ? 'verified' : 'not_captured'}"
    },
    {
      key_label: "Do you want to schedule a test drive",
      key_value: "test_drive",
      key_response: "{extracted.test_drive}",
      attempts: 1,
      remarks: "{extracted.test_drive ? 'verified' : 'not_captured'}"
    },
    {
      key_label: "What is your email id",
      key_value: "email",
      key_response: "{extracted.email}",
      attempts: 0,
      remarks: "{extracted.email ? 'verified' : 'not_captured'}"
    }
  ]
};

// Default Waybeo payload template
const DEFAULT_WAYBEO_TEMPLATE = {
  ucid: "{call_id}",
  call_status: "{completion_status}",
  call_start_time: "{start_time}",
  call_end_time: "{end_time}",
  call_duration: "{duration_sec}",
  caller_number: "{customer_number}",
  agent_id: "{agent_slug}",
  store_code: "{store_code}",
  transcript: "{transcript_text}",
  sales_data: {
    full_name: "{extracted.name}",
    car_model: "{extracted.model}",
    test_drive_interest: "{extracted.test_drive}",
    email_id: "{extracted.email}"
  },
  analytics: {
    total_exchanges: "{analytics.total_exchanges}",
    user_messages: "{analytics.user_messages}",
    assistant_messages: "{analytics.assistant_messages}"
  }
};

interface VoiceAgent {
  id: string;
  name: string;
  slug: string;
  phoneNumber?: string;
  greeting: string;
  accent: keyof typeof ACCENTS;
  language: keyof typeof LANGUAGES;
  voiceName: keyof typeof VOICE_NAMES;
  engine: keyof typeof ENGINE_LABELS;
  isActive: boolean;
  systemInstructions?: string;
  siPayloadTemplate?: object;
  waybeoPayloadTemplate?: object;
  // Webhook endpoints
  siEndpointUrl?: string;
  siAuthHeader?: string;
  waybeoEndpointUrl?: string;
  waybeoAuthHeader?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ConfigurationPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  
  // Form state
  const [form, setForm] = useState({
    name: "",
    phoneNumber: "",
    greeting: "",
    accent: "INDIAN" as keyof typeof ACCENTS,
    language: "ENGLISH" as keyof typeof LANGUAGES,
    voiceName: "ANANYA" as keyof typeof VOICE_NAMES,
    engine: "PRIMARY" as keyof typeof ENGINE_LABELS,
    isActive: true,
  });
  const [systemInstructions, setSystemInstructions] = useState("");
  const [siPayloadTemplate, setSiPayloadTemplate] = useState("");
  const [waybeoPayloadTemplate, setWaybeoPayloadTemplate] = useState("");
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [templateNoticeType, setTemplateNoticeType] = useState<"success" | "warning" | null>(null);
  // Webhook endpoint state
  const [siCustomerName, setSiCustomerName] = useState("");
  const [siEndpointUrl, setSiEndpointUrl] = useState("");
  const [siAuthHeader, setSiAuthHeader] = useState("");
  const [waybeoEndpointUrl, setWaybeoEndpointUrl] = useState("");
  const [waybeoAuthHeader, setWaybeoAuthHeader] = useState("");
  
  const [activeTab, setActiveTab] = useState<"settings" | "instructions" | "technical" | "si" | "waybeo">("settings");

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}`)
      .then((r) => r.json())
      .then((data: VoiceAgent) => {
        setAgent(data);
        setForm({
          name: data.name || "",
          phoneNumber: data.phoneNumber || "",
          greeting: data.greeting || "",
          accent: data.accent || "INDIAN",
          language: data.language || "ENGLISH",
          voiceName: data.voiceName || "ANANYA",
          engine: data.engine || "PRIMARY",
          isActive: data.isActive ?? true,
        });
        setSystemInstructions(data.systemInstructions || "");
        setSiPayloadTemplate(
          data.siPayloadTemplate 
            ? JSON.stringify(data.siPayloadTemplate, null, 2)
            : JSON.stringify(DEFAULT_SI_TEMPLATE, null, 2)
        );
        setWaybeoPayloadTemplate(
          data.waybeoPayloadTemplate
            ? JSON.stringify(data.waybeoPayloadTemplate, null, 2)
            : JSON.stringify(DEFAULT_WAYBEO_TEMPLATE, null, 2)
        );
        // Set webhook endpoints
        setSiCustomerName(data.siCustomerName || "");
        setSiEndpointUrl(data.siEndpointUrl || "");
        setSiAuthHeader(data.siAuthHeader || "");
        setWaybeoEndpointUrl(data.waybeoEndpointUrl || "");
        setWaybeoAuthHeader(data.waybeoAuthHeader || "");
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setTemplateNotice(null);
    setTemplateNoticeType(null);
    
    let siTemplate = null;
    let waybeoTemplate = null;
    
    try {
      siTemplate = JSON.parse(siPayloadTemplate);
    } catch {
      alert("Invalid JSON in SI Payload Template");
      setSaving(false);
      return;
    }
    
    try {
      waybeoTemplate = JSON.parse(waybeoPayloadTemplate);
    } catch {
      alert("Invalid JSON in Waybeo Payload Template");
      setSaving(false);
      return;
    }
    
    const res = await fetch(`/api/voiceagents/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ...form,
        systemInstructions,
        siPayloadTemplate: siTemplate,
        waybeoPayloadTemplate: waybeoTemplate,
        siCustomerName: siCustomerName || null,
        siEndpointUrl: siEndpointUrl || null,
        siAuthHeader: siAuthHeader || null,
        waybeoEndpointUrl: waybeoEndpointUrl || null,
        waybeoAuthHeader: waybeoAuthHeader || null,
      }),
    });
    if (res.ok) {
      const result = await res.json();
      const updated = result?.voiceAgent ?? result;
      setAgent(updated);

      const siValidation = result?.templateValidation?.si;
      const waybeoValidation = result?.templateValidation?.waybeo;
      const issues = [
        ...(siValidation?.unknownPlaceholders ?? []).map((item: string) => `SI: ${item}`),
        ...(waybeoValidation?.unknownPlaceholders ?? []).map((item: string) => `Waybeo: ${item}`),
      ];

      if (issues.length > 0) {
        setTemplateNotice(
          `Template saved, but these fields are not available from transcripts: ${issues.join(", ")}`
        );
        setTemplateNoticeType("warning");
      } else {
        setTemplateNotice("Payload templates are active. Webhooks will use these formats.");
        setTemplateNoticeType("success");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const resetSiTemplate = () => {
    setSiPayloadTemplate(JSON.stringify(DEFAULT_SI_TEMPLATE, null, 2));
  };

  const resetWaybeoTemplate = () => {
    setWaybeoPayloadTemplate(JSON.stringify(DEFAULT_WAYBEO_TEMPLATE, null, 2));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!agent) {
    return <p className="text-red-500">VoiceAgent not found</p>;
  }

  const tabs = [
    { id: "settings" as const, label: "General Settings" },
    { id: "instructions" as const, label: "System Instructions" },
    { id: "technical" as const, label: "Technical" },
    { id: "si" as const, label: "SI Payload" },
    { id: "waybeo" as const, label: "Waybeo Payload" },
  ];

  return (
    <div className="space-y-6">
      {templateNotice && templateNoticeType && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            templateNoticeType === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {templateNotice}
        </div>
      )}
      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* General Settings Tab */}
      {activeTab === "settings" && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">General Settings</h2>
              <p className="text-sm text-slate-500">Core settings for this VoiceAgent</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              form.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${form.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
              {form.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Kia VoiceAgent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Inbound Phone Number</label>
              <Input
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="+91 9876543210"
              />
              <p className="mt-1 text-xs text-slate-400">The phone number callers dial to reach this VoiceAgent</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Greeting Message</label>
            <Textarea
              value={form.greeting}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              rows={3}
              placeholder="Hello! Welcome to..."
            />
            <p className="mt-1 text-xs text-slate-400">The first message spoken when a call connects</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Voice</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={form.voiceName}
                onChange={(e) => setForm({ ...form, voiceName: e.target.value as keyof typeof VOICE_NAMES })}
              >
                {Object.entries(VOICE_NAMES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Accent</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={form.accent}
                onChange={(e) => setForm({ ...form, accent: e.target.value as keyof typeof ACCENTS })}
              >
                {Object.entries(ACCENTS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Language</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value as keyof typeof LANGUAGES })}
              >
                {Object.entries(LANGUAGES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Engine</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={form.engine}
                onChange={(e) => setForm({ ...form, engine: e.target.value as keyof typeof ENGINE_LABELS })}
              >
                {Object.entries(ENGINE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="isActive" className="text-sm text-slate-700">
              VoiceAgent is active and accepting calls
            </label>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400">
              Created {new Date(agent.createdAt).toLocaleDateString()} · Last updated {new Date(agent.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </Card>
      )}

      {/* System Instructions Tab */}
      {activeTab === "instructions" && (
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">System Instructions</h2>
            <p className="mt-1 text-sm text-slate-500">
              Full prompt/instructions used by the VoiceAgent during calls.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Instructions for {form.name}
            </label>
            <Textarea
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              rows={25}
              placeholder="Enter the full system instructions for this VoiceAgent..."
              className="font-mono text-sm leading-relaxed"
            />
            <p className="mt-2 text-xs text-slate-400">
              {systemInstructions.length.toLocaleString()} characters
            </p>
          </div>
        </Card>
      )}

      {/* Technical Tab */}
      {activeTab === "technical" && (
        <Card className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Technical Configuration</h2>
            <p className="mt-1 text-sm text-slate-500">
              Technical details and endpoints for this VoiceAgent.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Agent Identifier</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Slug:</span>
                  <code className="bg-white px-2 py-1 rounded border text-sm font-mono">{agent.slug}</code>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Name:</span>
                  <span className="text-sm font-medium text-slate-700">{form.name}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Telephony Endpoint</h3>
              <div className="space-y-2">
                <div className="text-sm text-slate-500">WSS URL:</div>
                <code className="block bg-white px-2 py-2 rounded border text-xs font-mono break-all">
                  wss://ws-singleinterfacews.pragyaa.ai/wsNew1?agent={agent.slug}
                </code>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Data Storage</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Base Directory:</span>
                  <code className="bg-white px-2 py-0.5 rounded border font-mono text-xs">/data/{agent.slug === "spotlight" ? "kia2" : agent.slug}/</code>
                </div>
                <div className="text-slate-500 text-xs space-y-1">
                  <div>• <code>transcripts/</code> - Conversation transcripts</div>
                  <div>• <code>si/</code> - SI webhook payloads</div>
                  <div>• <code>waybeo/</code> - Waybeo callback payloads</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Post-Call Actions</h3>
              <div className="text-sm text-slate-500 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Save transcript to file
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Generate & save SI payload
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Generate & save Waybeo payload
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Push to Admin UI database
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* SI Payload Template Tab */}
      {activeTab === "si" && (
        <Card className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">SI Payload Template</h2>
              <p className="mt-1 text-sm text-slate-500">
                JSON structure for Single Interface webhook payload. Use placeholders like{" "}
                <code className="bg-slate-100 px-1 rounded">{"{call_id}"}</code>,{" "}
                <code className="bg-slate-100 px-1 rounded">{"{extracted.name}"}</code> etc.
              </p>
            </div>
            <Button variant="secondary" onClick={resetSiTemplate} className="text-xs">
              Reset to Default
            </Button>
          </div>

          {/* Webhook Endpoint Configuration */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-semibold text-indigo-800">Webhook Configuration</h4>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-indigo-700 mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={siCustomerName}
                  onChange={(e) => setSiCustomerName(e.target.value)}
                  placeholder="Kia"
                  className="text-sm"
                />
                <p className="mt-1 text-xs text-indigo-600">
                  Account identifier passed in payload (e.g., &quot;Kia&quot;, &quot;LakmeSalon&quot;)
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-indigo-700 mb-1">
                  SI Endpoint URL
                </label>
                <Input
                  value={siEndpointUrl}
                  onChange={(e) => setSiEndpointUrl(e.target.value)}
                  placeholder="https://testing.myspotlight.co/api/voicebot-lead-save"
                  className="text-sm"
                />
                <p className="mt-1 text-xs text-indigo-600">
                  POST request will be sent here after each call
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-indigo-700 mb-1">
                  Authorization Header
                </label>
                <Input
                  value={siAuthHeader}
                  onChange={(e) => setSiAuthHeader(e.target.value)}
                  placeholder="Bearer your-api-key-here"
                  className="text-sm font-mono"
                />
                <p className="mt-1 text-xs text-indigo-600">
                  Sent as Authorization header (e.g., &quot;Bearer xxx&quot;)
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-800 mb-2">Available Placeholders</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-blue-700">
              <code>{"{call_id}"}</code>
              <code>{"{agent_name}"}</code>
              <code>{"{agent_slug}"}</code>
              <code>{"{start_time}"}</code>
              <code>{"{end_time}"}</code>
              <code>{"{duration_sec}"}</code>
              <code>{"{customer_number}"}</code>
              <code>{"{store_code}"}</code>
              <code>{"{completion_status}"}</code>
              <code>{"{detected_language}"}</code>
              <code>{"{extracted.name}"}</code>
              <code>{"{extracted.model}"}</code>
              <code>{"{extracted.test_drive}"}</code>
              <code>{"{extracted.email}"}</code>
              <code>{"{transfer_status}"}</code>
              <code>{"{transfer_reason}"}</code>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Payload Template</label>
            <Textarea
              value={siPayloadTemplate}
              onChange={(e) => setSiPayloadTemplate(e.target.value)}
              rows={25}
              placeholder="Enter SI payload JSON template..."
              className="font-mono text-xs leading-relaxed"
            />
          </div>
        </Card>
      )}

      {/* Waybeo Payload Template Tab */}
      {activeTab === "waybeo" && (
        <Card className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Waybeo Payload Template</h2>
              <p className="mt-1 text-sm text-slate-500">
                JSON structure for Waybeo callback payload. Use same placeholders as SI template.
              </p>
            </div>
            <Button variant="secondary" onClick={resetWaybeoTemplate} className="text-xs">
              Reset to Default
            </Button>
          </div>

          {/* Webhook Endpoint Configuration */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-semibold text-amber-800">Webhook Endpoint</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-amber-700 mb-1">
                  Waybeo Endpoint URL
                </label>
                <Input
                  value={waybeoEndpointUrl}
                  onChange={(e) => setWaybeoEndpointUrl(e.target.value)}
                  placeholder="https://pbx-uat.waybeo.com/bot-call"
                  className="text-sm"
                />
                <p className="mt-1 text-xs text-amber-600">
                  POST request will be sent here after each call
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-amber-700 mb-1">
                  Authorization Header
                </label>
                <Input
                  value={waybeoAuthHeader}
                  onChange={(e) => setWaybeoAuthHeader(e.target.value)}
                  placeholder="Bearer your-waybeo-token"
                  className="text-sm font-mono"
                />
                <p className="mt-1 text-xs text-amber-600">
                  Sent as Authorization header (e.g., &quot;Bearer xxx&quot;)
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-amber-800 mb-2">Additional Placeholders</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-amber-700">
              <code>{"{transcript_text}"}</code>
              <code>{"{transcript_json}"}</code>
              <code>{"{analytics.total_exchanges}"}</code>
              <code>{"{analytics.user_messages}"}</code>
              <code>{"{analytics.assistant_messages}"}</code>
              <code>{"{waybeo_header.*}"}</code>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Payload Template</label>
            <Textarea
              value={waybeoPayloadTemplate}
              onChange={(e) => setWaybeoPayloadTemplate(e.target.value)}
              rows={25}
              placeholder="Enter Waybeo payload JSON template..."
              className="font-mono text-xs leading-relaxed"
            />
          </div>
        </Card>
      )}

      {/* Save Button - Always visible */}
      <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg sticky bottom-4">
        <div>
          {saved && (
            <span className="text-sm text-emerald-600 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved successfully
            </span>
          )}
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>
    </div>
  );
}
