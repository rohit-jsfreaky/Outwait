/**
 * The AgentMail REST surface this app uses. Plain fetch, no SDK, because
 * Convex actions run in Convex's own runtime and a thin client is easier to
 * reason about than a generated one.
 *
 * Nothing here touches the database. Callers are actions.
 */

const BASE = "https://api.agentmail.to/v0";

export const INBOX_ID = "outwait@agentmail.to";

function apiKey(): string {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error("AGENTMAIL_API_KEY is not set on this deployment");
  return key;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`AgentMail ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

export type SentMessage = { message_id: string; thread_id: string };

/** Send a new message from the agent's own inbox. */
export async function sendMessage(input: {
  to: string[];
  subject: string;
  text: string;
  labels?: string[];
}): Promise<SentMessage> {
  return (await call("POST", `/inboxes/${encodeURIComponent(INBOX_ID)}/messages/send`, {
    to: input.to,
    subject: input.subject,
    text: input.text,
    labels: input.labels,
  })) as SentMessage;
}

export type AttachmentMeta = {
  attachment_id: string;
  size: number;
  filename?: string;
  content_type?: string;
};

export type FullMessage = {
  message_id: string;
  thread_id: string;
  inbox_id: string;
  from: string;
  to: string[];
  subject?: string;
  text?: string;
  /**
   * The new text only, with the quoted reply chain stripped. Far better input
   * for classification than `text`, which carries the whole history.
   */
  extracted_text?: string;
  attachments?: AttachmentMeta[];
};

/**
 * The webhook payload does NOT carry attachments — only the message body. To
 * see what a person attached, the message has to be fetched.
 */
export async function getMessage(messageId: string): Promise<FullMessage> {
  return (await call(
    "GET",
    `/inboxes/${encodeURIComponent(INBOX_ID)}/messages/${encodeURIComponent(messageId)}`,
  )) as FullMessage;
}

/**
 * Download one attachment.
 *
 * The docs say this endpoint returns the raw file. It does not — it returns
 * JSON carrying a short-lived pre-signed `download_url` on the AgentMail CDN,
 * and the bytes have to be fetched from there. Storing the first response
 * directly stores the metadata JSON, and every image then renders broken.
 */
export async function getAttachment(
  messageId: string,
  attachmentId: string,
): Promise<{ blob: Blob; contentType: string; filename?: string }> {
  const meta = (await call(
    "GET",
    `/inboxes/${encodeURIComponent(INBOX_ID)}/messages/${encodeURIComponent(
      messageId,
    )}/attachments/${encodeURIComponent(attachmentId)}`,
  )) as { download_url?: string; content_type?: string; filename?: string };

  if (!meta.download_url) {
    throw new Error("attachment response carried no download_url");
  }

  const file = await fetch(meta.download_url);
  if (!file.ok) {
    throw new Error(`attachment download failed: ${file.status}`);
  }

  const blob = await file.blob();
  const contentType =
    meta.content_type ?? file.headers.get("content-type") ?? "application/octet-stream";

  // Never silently store an error page or a JSON body as if it were the file.
  if (contentType.includes("application/json")) {
    throw new Error("attachment download returned JSON, not a file");
  }

  return { blob, contentType, filename: meta.filename };
}

// ---------------------------------------------------------------------------
// Drafts — boundary 2. Anything binding is held here until a human approves.
// ---------------------------------------------------------------------------

export type CreatedDraft = { draft_id: string };

/** Compose but do not send. This is the gate, and it is server-side. */
export async function createDraft(input: {
  to: string[];
  subject: string;
  text: string;
  labels?: string[];
}): Promise<CreatedDraft> {
  return (await call("POST", `/inboxes/${encodeURIComponent(INBOX_ID)}/drafts`, {
    to: input.to,
    subject: input.subject,
    text: input.text,
    labels: input.labels,
  })) as CreatedDraft;
}

/** Send a held draft. Only ever called after a human has said yes. */
export async function sendDraft(draftId: string): Promise<SentMessage> {
  return (await call(
    "POST",
    `/inboxes/${encodeURIComponent(INBOX_ID)}/drafts/${encodeURIComponent(draftId)}/send`,
    {},
  )) as SentMessage;
}

export async function deleteDraft(draftId: string): Promise<void> {
  await call("DELETE", `/inboxes/${encodeURIComponent(INBOX_ID)}/drafts/${encodeURIComponent(draftId)}`);
}
