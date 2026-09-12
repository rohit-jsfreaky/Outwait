/**
 * THE ONLY FILE THAT CALLS A MODEL.
 *
 * Every other file in this backend is deterministic. That is the rule, and it
 * is the reason a rerun produces the same result instead of a story the model
 * told. The model is used for exactly one kind of work: reading human prose
 * (a forwarded email, a reply) and returning structured fields. It never
 * decides what the agent does next, never decides what is sent, and never
 * decides whether something is safe to send.
 *
 * Named jobs only. If you want a new model call, add a named export here with
 * its own prompt and its own parser. Do not export a generic `complete()`.
 *
 * Model: OpenAI GPT-5.6 Luna, reached through OpenRouter.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatMessage = { role: "system" | "user"; content: string };

async function callModel(
  job: string,
  messages: ChatMessage[],
  maxTokens = 900,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set on this deployment");
  const model = process.env.MODEL_ID ?? "openai/gpt-5.6-luna";

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Outwait",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`model job "${job}" failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`model job "${job}" returned no content`);
  return content;
}

/** Models sometimes wrap JSON in a code fence even when asked not to. */
function parseJson(job: string, raw: string): Record<string, unknown> {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("not an object");
  } catch {
    throw new Error(`model job "${job}" did not return JSON: ${text.slice(0, 200)}`);
  }
}

const str = (o: Record<string, unknown>, k: string): string | undefined => {
  const val = o[k];
  return typeof val === "string" && val.trim() !== "" ? val.trim() : undefined;
};

const num = (o: Record<string, unknown>, k: string): number | undefined => {
  const val = o[k];
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const cleaned = Number(val.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(cleaned) && cleaned > 0) return cleaned;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// JOB 1 — read a forwarded email and turn it into a case.
// ---------------------------------------------------------------------------

export type ExtractedCase = {
  title: string;
  companyName: string;
  companyDomain?: string;
  replyTo?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  summary?: string;
};

const EXTRACT_SYSTEM = `You read one forwarded email and pull out the facts of a stuck admin case:
money someone is owed, or an outcome they were promised and have not received.

Return ONLY a JSON object with these keys:
  title        short, plain, specific. e.g. "Kingsley deposit" or "BA flight delay payout".
               Never a full sentence. Never include the word "case".
  companyName  the company the person is chasing, NOT the person forwarding it.
  companyDomain the company's domain if you can see one, else omit.
  replyTo      the best email address to write to at that company, else omit.
  amount       the number only, no symbols or separators. Omit if not stated.
  currency     ISO code like GBP, USD, INR, EUR. Omit if unclear.
  reference    any claim, booking, tenancy or ticket reference. Omit if absent.
  summary      one plain sentence on what is owed and what has happened so far.

Rules:
- Report only what the email actually says. Never invent an amount or a reference.
- If a field is not in the email, omit the key. Do not guess and do not write "unknown".
- Write like a person talking. No jargon.`;

export async function extractCase(input: {
  from: string;
  subject?: string;
  body: string;
}): Promise<ExtractedCase> {
  const raw = await callModel("extractCase", [
    { role: "system", content: EXTRACT_SYSTEM },
    {
      role: "user",
      content: `Forwarded by: ${input.from}\nSubject: ${input.subject ?? "(none)"}\n\n${input.body.slice(0, 12000)}`,
    },
  ]);

  const o = parseJson("extractCase", raw);
  const companyName = str(o, "companyName") ?? "Unknown company";
  return {
    title: str(o, "title") ?? `${companyName} claim`,
    companyName,
    companyDomain: str(o, "companyDomain"),
    replyTo: str(o, "replyTo"),
    amount: num(o, "amount"),
    currency: str(o, "currency")?.toUpperCase(),
    reference: str(o, "reference"),
    summary: str(o, "summary"),
  };
}

// ---------------------------------------------------------------------------
// JOB 2 — classify an inbound reply so deterministic code can route it.
//
// The model labels. It does not act. `convex/agent/decide.ts` owns what
// happens next, so the same label always produces the same behaviour.
// ---------------------------------------------------------------------------

export type ReplyClassification = {
  intent:
    | "approval"
    | "refusal"
    | "answer"
    | "company_reply"
    | "asks_for_more"
    | "unrelated";
  summary: string;
  reference?: string;
};

const CLASSIFY_SYSTEM = `You label one inbound email in an ongoing dispute. Return ONLY JSON:
  intent   one of: approval, refusal, answer, company_reply, asks_for_more, unrelated
             approval      the person is telling us to go ahead
             refusal       the person is telling us not to
             answer        the person answered a question we asked
             company_reply the company being chased has written back
             asks_for_more the sender wants more information or documents from us
             unrelated     none of the above
  summary  one plain sentence saying what the email says.
  reference any reference or case number the email quotes, else omit.

Report only what is written. Do not infer intent that is not clearly there.`;

export async function classifyReply(input: {
  from: string;
  subject?: string;
  body: string;
}): Promise<ReplyClassification> {
  const raw = await callModel(
    "classifyReply",
    [
      { role: "system", content: CLASSIFY_SYSTEM },
      {
        role: "user",
        content: `From: ${input.from}\nSubject: ${input.subject ?? "(none)"}\n\n${input.body.slice(0, 8000)}`,
      },
    ],
    400,
  );

  const o = parseJson("classifyReply", raw);
  const allowed = [
    "approval",
    "refusal",
    "answer",
    "company_reply",
    "asks_for_more",
    "unrelated",
  ] as const;
  const got = str(o, "intent");
  const intent = (allowed as readonly string[]).includes(got ?? "")
    ? (got as ReplyClassification["intent"])
    : "unrelated";

  return {
    intent,
    summary: str(o, "summary") ?? "No summary.",
    reference: str(o, "reference"),
  };
}
