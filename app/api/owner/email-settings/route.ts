import { NextRequest, NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/ownerAuth";
import { getRequestUrl } from "@/lib/requestOrigin";
import {
  normalizeTunnelEmailSettings,
  readTunnelEmailSettings,
  saveTunnelEmailSettings,
} from "@/lib/tunnelEmailSettings";

export async function GET(req: NextRequest) {
  if (!isOwnerRequest(req)) {
    return NextResponse.json({ ok: false, error: "Owner login required." }, { status: 401 });
  }

  const settings = await readTunnelEmailSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function POST(req: NextRequest) {
  if (!isOwnerRequest(req)) {
    return NextResponse.json({ ok: false, error: "Owner login required." }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      const form = await req.formData();
      const action = String(form.get("_action") ?? "save");
      const payload = buildPayloadFromForm(form);
      const settings = applyFormAction(payload, action);
      await saveTunnelEmailSettings(settings);
      return NextResponse.redirect(getRequestUrl(req, "/owner"), { status: 303 });
    }

    const payload = await req.json();
    const settings = await saveTunnelEmailSettings(payload);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Settings did not save." },
      { status: 400 }
    );
  }
}

function formValues(form: FormData, key: string) {
  return form.getAll(key).map((value) => String(value));
}

function formBoolean(form: FormData, key: string) {
  return formValues(form, key).includes("true");
}

function buildPayloadFromForm(form: FormData) {
  return {
    enabled: formBoolean(form, "enabled"),
    sendTimesLocal: formValues(form, "sendTimesLocal"),
    waitUntilSendTime: formBoolean(form, "waitUntilSendTime"),
    deliveryMode: String(form.get("deliveryMode") ?? "together"),
    recipientEmails: formValues(form, "recipientEmails"),
    from: String(form.get("from") ?? ""),
    subject: String(form.get("subject") ?? ""),
    bodyTemplate: String(form.get("bodyTemplate") ?? ""),
  };
}

function removeAt<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function nextSendTime(existingTimes: string[]) {
  const candidates = ["12:00", "15:00", "18:00", "21:00"];
  return candidates.find((time) => !existingTimes.includes(time)) ?? "12:00";
}

function applyFormAction(payload: ReturnType<typeof buildPayloadFromForm>, action: string) {
  const settings = normalizeTunnelEmailSettings(payload);

  if (action === "add-time") {
    return normalizeTunnelEmailSettings({
      ...settings,
      sendTimesLocal: [...settings.sendTimesLocal, nextSendTime(settings.sendTimesLocal)],
    });
  }

  if (action.startsWith("remove-time:")) {
    const index = Number(action.split(":")[1]);
    const nextTimes = Number.isInteger(index) ? removeAt(settings.sendTimesLocal, index) : settings.sendTimesLocal;
    return normalizeTunnelEmailSettings({
      ...settings,
      sendTimesLocal: nextTimes.length > 0 ? nextTimes : ["09:00"],
    });
  }

  if (action === "add-recipient") {
    return normalizeTunnelEmailSettings({
      ...settings,
      recipientEmails: [...settings.recipientEmails, ""],
    });
  }

  if (action.startsWith("remove-recipient:")) {
    const index = Number(action.split(":")[1]);
    const nextRecipients = Number.isInteger(index)
      ? removeAt(settings.recipientEmails, index)
      : settings.recipientEmails;
    return normalizeTunnelEmailSettings({
      ...settings,
      recipientEmails: nextRecipients.length > 0 ? nextRecipients : [""],
    });
  }

  return settings;
}
