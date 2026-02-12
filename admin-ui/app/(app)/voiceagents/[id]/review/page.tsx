"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useSession } from "next-auth/react";

interface ExtractedField {
  fieldName: string;
  fieldLabel: string;
  value: string;
  attempts: number;
  attemptsDetails: string | null;
  remarks: string | null;
  needsReview: boolean;
}

interface CallForReview {
  id: string;
  callId: string;
  voiceAgent: {
    id: string;
    name: string;
    slug: string;
  };
  startedAt: string;
  endedAt: string;
  durationSec: number;
  outcome: string;
  sentiment: string;
  reviewStatus: string;
  extractedFields: ExtractedField[];
  fieldsNeedingReview: number;
  totalFields: number;
  dataQualityScore: number;
  existingLabels: number;
}

interface DataLabel {
  fieldName: string;
  fieldLabel: string;
  originalValue: string;
  correctedValue: string;
  correctionReason: string;
  isCorrect: boolean;
  attemptNumber: number;
  notes: string;
}

export default function HumanReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [calls, setCalls] = useState<CallForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<CallForReview | null>(null);
  const [labels, setLabels] = useState<Record<string, DataLabel>>({});
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");

  const fetchCallsForReview = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        voiceAgentId: params.id as string,
        status: statusFilter,
        limit: "50",
      });
      const res = await fetch(`/api/calls/review?${queryParams}`);
      const data = await res.json();
      setCalls(data.calls || []);
    } catch (error) {
      console.error("Error fetching calls:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCallsForReview();
  }, [params.id, statusFilter]);

  const handleSelectCall = (call: CallForReview) => {
    setSelectedCall(call);
    // Initialize labels with current values
    const initialLabels: Record<string, DataLabel> = {};
    call.extractedFields.forEach((field) => {
      initialLabels[field.fieldName] = {
        fieldName: field.fieldName,
        fieldLabel: field.fieldLabel,
        originalValue: field.value || "",
        correctedValue: field.value || "",
        correctionReason: "",
        isCorrect: !!field.value && field.attempts === 1,
        attemptNumber: field.attempts,
        notes: "",
      };
    });
    setLabels(initialLabels);
  };

  const handleLabelChange = (
    fieldName: string,
    key: keyof DataLabel,
    value: any
  ) => {
    setLabels((prev) => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        [key]: value,
      },
    }));
  };

  const handleSubmitLabels = async () => {
    if (!selectedCall) return;

    setSubmitting(true);
    try {
      // Only submit labels that have been corrected or confirmed
      const labelsToSubmit = Object.values(labels).filter(
        (label) => label.correctedValue !== label.originalValue || !label.isCorrect
      );

      if (labelsToSubmit.length === 0) {
        alert("No changes to submit. Please correct at least one field.");
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/calls/${selectedCall.id}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labels: labelsToSubmit,
          labeledBy: session?.user?.email || "anonymous",
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        alert(`Successfully submitted ${labelsToSubmit.length} label(s)!`);
        setSelectedCall(null);
        fetchCallsForReview();
      } else {
        alert("Failed to submit labels: " + data.error);
      }
    } catch (error) {
      console.error("Error submitting labels:", error);
      alert("Failed to submit labels");
    }
    setSubmitting(false);
  };

  const handleMarkAsNoIssues = async (callId: string) => {
    try {
      const res = await fetch(`/api/calls/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callSessionId: callId,
          reviewStatus: "NO_ISSUES",
          reviewedBy: session?.user?.email || "anonymous",
        }),
      });

      if (res.ok) {
        fetchCallsForReview();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getAttemptBadge = (attempts: number) => {
    if (attempts === 1) return <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">✓ 1st</span>;
    if (attempts === 2) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">⚠ 2nd</span>;
    if (attempts >= 3) return <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">⚠ 3rd+</span>;
    return <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">✗ None</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Human Review</h2>
          <p className="text-sm text-slate-500 mt-1">
            Review and label data extractions to improve VoiceAgent accuracy
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm"
          >
            <option value="PENDING">Pending Review</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="REVIEWED">Reviewed</option>
          </select>
        </div>
      </div>

      {/* Calls List */}
      {!selectedCall && (
        <Card>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Calls Needing Review ({calls.length})
          </h3>
          
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : calls.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No calls need review. Great job! 🎉
            </div>
          ) : (
            <div className="space-y-3">
              {calls.map((call) => (
                <div
                  key={call.id}
                  className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Link
                          href={`/voiceagents/${params.id}/calls/${call.id}`}
                          className="font-mono text-sm text-indigo-600 hover:underline"
                        >
                          {call.callId}
                        </Link>
                        <span className={`text-lg font-bold ${getQualityColor(call.dataQualityScore)}`}>
                          {call.dataQualityScore}% Quality
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                          {call.fieldsNeedingReview}/{call.totalFields} fields need review
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <div>
                          {new Date(call.startedAt).toLocaleString()} · {formatDuration(call.durationSec)}
                        </div>
                        <div className="flex gap-2 flex-wrap mt-2">
                          {call.extractedFields.map((field) => (
                            <div
                              key={field.fieldName}
                              className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1"
                            >
                              <span className="text-xs text-slate-500">{field.fieldLabel}:</span>
                              <span className="text-xs font-medium">
                                {field.value || <span className="text-red-500">missing</span>}
                              </span>
                              {getAttemptBadge(field.attempts)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleSelectCall(call)} variant="primary">
                        Review
                      </Button>
                      <Button
                        onClick={() => handleMarkAsNoIssues(call.id)}
                        variant="secondary"
                      >
                        No Issues
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Label Form */}
      {selectedCall && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Reviewing Call: {selectedCall.callId}
                </h3>
                <p className="text-sm text-slate-500">
                  {new Date(selectedCall.startedAt).toLocaleString()} · {formatDuration(selectedCall.durationSec)}
                </p>
              </div>
              <Button onClick={() => setSelectedCall(null)} variant="secondary">
                ← Back to List
              </Button>
            </div>

            <div className="space-y-4">
              {selectedCall.extractedFields.map((field) => {
                const label = labels[field.fieldName];
                if (!label) return null;

                return (
                  <div
                    key={field.fieldName}
                    className="border border-slate-200 rounded-lg p-4 bg-slate-50"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-slate-900">{field.fieldLabel}</h4>
                        {getAttemptBadge(field.attempts)}
                        {field.remarks && (
                          <span className="text-xs text-slate-500 italic">({field.remarks})</span>
                        )}
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={label.isCorrect}
                          onChange={(e) =>
                            handleLabelChange(field.fieldName, "isCorrect", e.target.checked)
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">Original is correct</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Original Value
                        </label>
                        <Input
                          value={label.originalValue}
                          readOnly
                          className="bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Corrected Value *
                        </label>
                        <Input
                          value={label.correctedValue}
                          onChange={(e) =>
                            handleLabelChange(field.fieldName, "correctedValue", e.target.value)
                          }
                          className={!label.isCorrect ? "border-green-500" : ""}
                        />
                      </div>
                    </div>

                    {!label.isCorrect && (
                      <>
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Correction Reason
                          </label>
                          <select
                            value={label.correctionReason}
                            onChange={(e) =>
                              handleLabelChange(field.fieldName, "correctionReason", e.target.value)
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                          >
                            <option value="">Select reason...</option>
                            <option value="misheard">Misheard / Speech recognition error</option>
                            <option value="pronunciation">Pronunciation issue</option>
                            <option value="accent">Accent / dialect issue</option>
                            <option value="background_noise">Background noise</option>
                            <option value="unclear_speech">Unclear speech</option>
                            <option value="context_misunderstanding">Context misunderstanding</option>
                            <option value="other">Other</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Additional Notes (optional)
                          </label>
                          <Textarea
                            value={label.notes}
                            onChange={(e) =>
                              handleLabelChange(field.fieldName, "notes", e.target.value)
                            }
                            rows={2}
                            placeholder="Add context about what the user said or why this was difficult to capture..."
                          />
                        </div>
                      </>
                    )}

                    {field.attemptsDetails && (
                      <div className="mt-3 text-xs text-slate-500 bg-white p-2 rounded">
                        <strong>Attempt History:</strong> {field.attemptsDetails}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <Button onClick={() => setSelectedCall(null)} variant="secondary">
                Cancel
              </Button>
              <Button
                onClick={handleSubmitLabels}
                variant="primary"
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit Labels"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
