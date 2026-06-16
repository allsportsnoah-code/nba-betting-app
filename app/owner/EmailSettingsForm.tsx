"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { TunnelEmailSettings } from "@/lib/tunnelEmailSettings";

type EmailSettingsFormProps = {
  initialSettings: TunnelEmailSettings;
};

const DRAFT_STORAGE_KEY = "betting-lab-owner-email-settings-draft-v1";

function getRecipientRows(settings: TunnelEmailSettings) {
  const savedRows = Array.isArray(settings.recipientEmails) ? settings.recipientEmails : [];
  const parsedRows = settings.recipients
    .split(/[,;\n]/)
    .map((email) => email.trim())
    .filter(Boolean);

  if (savedRows.length > 0) return savedRows;
  if (parsedRows.length > 0) return parsedRows;
  return [""];
}

function getSendTimeRows(settings: TunnelEmailSettings) {
  if (settings.sendTimesLocal.length > 0) return settings.sendTimesLocal;
  return [settings.sendTimeLocal || "09:00"];
}

function buildFormState(settings: TunnelEmailSettings): TunnelEmailSettings {
  const sendTimesLocal = getSendTimeRows(settings);
  const recipientEmails = getRecipientRows(settings);

  return {
    ...settings,
    sendTimeLocal: sendTimesLocal[0] ?? "09:00",
    sendTimesLocal,
    recipientEmails,
    recipients: recipientEmails.map((email) => email.trim()).filter(Boolean).join(", "),
  };
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  const rows = value.map((item) => (typeof item === "string" ? item : "")).slice(0, 20);
  return rows.length > 0 ? rows : fallback;
}

function readSavedDraft(fallback: TunnelEmailSettings) {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { formState?: Partial<TunnelEmailSettings> };
    const draft = parsed.formState;
    if (!draft) return null;

    const sendTimesLocal = readStringArray(draft.sendTimesLocal, fallback.sendTimesLocal);
    const recipientEmails = readStringArray(draft.recipientEmails, fallback.recipientEmails);

    return {
      ...fallback,
      enabled: typeof draft.enabled === "boolean" ? draft.enabled : fallback.enabled,
      sendTimeLocal: readString(draft.sendTimeLocal, sendTimesLocal[0] ?? fallback.sendTimeLocal),
      sendTimesLocal,
      waitUntilSendTime:
        typeof draft.waitUntilSendTime === "boolean"
          ? draft.waitUntilSendTime
          : fallback.waitUntilSendTime,
      deliveryMode: draft.deliveryMode === "individual" ? "individual" : fallback.deliveryMode,
      recipientEmails,
      recipients: recipientEmails.map((email) => email.trim()).filter(Boolean).join(", "),
      from: readString(draft.from, fallback.from),
      subject: readString(draft.subject, fallback.subject),
      bodyTemplate: readString(draft.bodyTemplate, fallback.bodyTemplate),
    } satisfies TunnelEmailSettings;
  } catch {
    return null;
  }
}

function persistDraft(formState: TunnelEmailSettings) {
  window.localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      formState,
    })
  );
}

function nextSendTime(existingTimes: string[]) {
  const candidates = ["12:00", "15:00", "18:00", "21:00"];
  return candidates.find((time) => !existingTimes.includes(time)) ?? "12:00";
}

export default function EmailSettingsForm({ initialSettings }: EmailSettingsFormProps) {
  const initialFormState = buildFormState(initialSettings);
  const [formState, setFormState] = useState<TunnelEmailSettings>(initialFormState);
  const [draftReady, setDraftReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedDraft = readSavedDraft(initialFormState);
    if (savedDraft) {
      setFormState(savedDraft);
      setMessage("Restored your unsaved email draft from this browser.");
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    persistDraft(formState);
  }, [draftReady, formState]);

  function updateField<K extends keyof TunnelEmailSettings>(key: K, value: TunnelEmailSettings[K]) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
    setMessage("Draft autosaved in this browser.");
  }

  function updateSendTime(index: number, value: string) {
    setFormState((current) => {
      const sendTimesLocal = current.sendTimesLocal.map((time, timeIndex) =>
        timeIndex === index ? value : time
      );

      return {
        ...current,
        sendTimesLocal,
        sendTimeLocal: sendTimesLocal[0] ?? "09:00",
      };
    });
    setMessage("Draft autosaved in this browser.");
  }

  function addSendTime() {
    setFormState((current) => {
      if (current.sendTimesLocal.length >= 8) return current;
      const sendTimesLocal = [...current.sendTimesLocal, nextSendTime(current.sendTimesLocal)];

      return {
        ...current,
        sendTimesLocal,
        sendTimeLocal: sendTimesLocal[0] ?? "09:00",
      };
    });
    setMessage("Draft autosaved in this browser.");
  }

  function removeSendTime(index: number) {
    setFormState((current) => {
      const sendTimesLocal = current.sendTimesLocal.filter((_, timeIndex) => timeIndex !== index);
      const safeTimes = sendTimesLocal.length > 0 ? sendTimesLocal : ["09:00"];

      return {
        ...current,
        sendTimesLocal: safeTimes,
        sendTimeLocal: safeTimes[0] ?? "09:00",
      };
    });
    setMessage("Draft autosaved in this browser.");
  }

  function updateRecipient(index: number, value: string) {
    setFormState((current) => {
      const recipientEmails = current.recipientEmails.map((email, emailIndex) =>
        emailIndex === index ? value : email
      );

      return {
        ...current,
        recipientEmails,
        recipients: recipientEmails.map((email) => email.trim()).filter(Boolean).join(", "),
      };
    });
    setMessage("Draft autosaved in this browser.");
  }

  function addRecipient() {
    setFormState((current) => {
      if (current.recipientEmails.length >= 20) return current;
      const recipientEmails = [...current.recipientEmails, ""];

      return {
        ...current,
        recipientEmails,
        recipients: recipientEmails.map((email) => email.trim()).filter(Boolean).join(", "),
      };
    });
    setMessage("Draft autosaved in this browser.");
  }

  function removeRecipient(index: number) {
    setFormState((current) => {
      const recipientEmails = current.recipientEmails.filter((_, emailIndex) => emailIndex !== index);
      const safeRecipients = recipientEmails.length > 0 ? recipientEmails : [""];

      return {
        ...current,
        recipientEmails: safeRecipients,
        recipients: safeRecipients.map((email) => email.trim()).filter(Boolean).join(", "),
      };
    });
    setMessage("Draft autosaved in this browser.");
  }

  function discardDraft() {
    const nextState = buildFormState(initialSettings);
    setFormState(nextState);
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setMessage("Draft cleared.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setMessage("Saving...");

      const res = await fetch("/api/owner/email-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(formState),
      });

      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.error || "Settings did not save.");
        return;
      }

      const savedState = buildFormState(data.settings as TunnelEmailSettings);
      setFormState(savedState);
      persistDraft(savedState);
      setMessage("Email settings saved.");
    } catch {
      setMessage("Settings did not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 shadow-sm">
          <span className="text-sm font-semibold text-slate-900">Email links</span>
          <span className="mt-3 flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              checked={formState.enabled}
              onChange={(event) => updateField("enabled", event.target.checked)}
              className="h-4 w-4"
            />
            Enabled
          </span>
        </label>

        <label className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 shadow-sm">
          <span className="text-sm font-semibold text-slate-900">Delivery mode</span>
          <select
            name="deliveryMode"
            value={formState.deliveryMode}
            onChange={(event) =>
              updateField(
                "deliveryMode",
                event.target.value === "individual" ? "individual" : "together"
              )
            }
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="together">One email to everyone</option>
            <option value="individual">Separate email to each</option>
          </select>
        </label>

        <label className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 shadow-sm">
          <span className="text-sm font-semibold text-slate-900">If ready early</span>
          <span className="mt-3 flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="waitUntilSendTime"
              value="true"
              checked={formState.waitUntilSendTime}
              onChange={(event) => updateField("waitUntilSendTime", event.target.checked)}
              className="h-4 w-4"
            />
            Wait for send time
          </span>
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Send times</div>
            <div className="mt-1 text-xs text-slate-500">
              Add more than one time if you want the current link sent again later.
            </div>
          </div>
          <button
            type="button"
            onClick={addSendTime}
            disabled={formState.sendTimesLocal.length >= 8}
            className="app-button app-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add time
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {formState.sendTimesLocal.map((time, index) => (
            <div key={`send-time-${index}`} className="flex items-center gap-2">
              <input
                type="time"
                name="sendTimesLocal"
                value={time}
                onChange={(event) => updateSendTime(index, event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <button
                type="button"
                onClick={() => removeSendTime(index)}
                disabled={formState.sendTimesLocal.length <= 1}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Remove send time ${index + 1}`}
              >
                X
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Send to</div>
              <div className="mt-1 text-xs text-slate-500">Each person gets their own row.</div>
            </div>
            <button
              type="button"
              onClick={addRecipient}
              disabled={formState.recipientEmails.length >= 20}
              className="app-button app-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add person
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {formState.recipientEmails.map((email, index) => (
              <div key={`recipient-${index}`} className="flex items-center gap-2">
                <input
                  type="email"
                  name="recipientEmails"
                  value={email}
                  onChange={(event) => updateRecipient(index, event.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                  placeholder="email@example.com"
                />
                <button
                  type="button"
                  onClick={() => removeRecipient(index)}
                  disabled={formState.recipientEmails.length <= 1}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Remove recipient ${index + 1}`}
                >
                  X
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          Send from
          <input
            type="email"
            name="from"
            value={formState.from}
            onChange={(event) => updateField("from", event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900"
            placeholder="sender@example.com"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-900">
        Subject
        <input
          type="text"
          name="subject"
          value={formState.subject}
          onChange={(event) => updateField("subject", event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900"
        />
      </label>

      <label className="grid gap-2 text-sm font-semibold text-slate-900">
        Email body
        <textarea
          name="bodyTemplate"
          value={formState.bodyTemplate}
          onChange={(event) => updateField("bodyTemplate", event.target.value)}
          rows={10}
          className="min-h-[14rem] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-normal leading-6 text-slate-900"
        />
      </label>

      <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        Tokens: <strong>{"{{baseLink}}"}</strong>, <strong>{"{{mlbLink}}"}</strong>,{" "}
        <strong>{"{{ownerLink}}"}</strong>, <strong>{"{{sentAt}}"}</strong>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="app-button app-button-primary disabled:opacity-50">
          {saving ? "Saving..." : "Save email settings"}
        </button>
        <button type="button" onClick={discardDraft} className="app-button app-button-secondary">
          Discard draft
        </button>
        {message ? <span className="text-sm font-medium text-slate-600">{message}</span> : null}
      </div>
    </form>
  );
}
