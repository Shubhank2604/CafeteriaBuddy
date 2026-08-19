const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

type CallOpts = { temperature?: number; maxTokens?: number };
type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
  }[];
  error?: { message?: string };
};

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function geminiBaseUrl() {
  return (process.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

/** Strip fences and grab the outermost JSON object or array. */
function sliceJsonBlob(raw: string): string {
  let value = raw
    .replace(/```json\s*/gi, "```")
    .replace(/```/g, "")
    .trim();
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");
  let start = -1;
  if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
    start = objectStart;
  } else if (arrayStart >= 0) {
    start = arrayStart;
  }
  if (start < 0) return value;
  value = value.slice(start);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return value.slice(0, index + 1);
    }
  }
  return value;
}

function repairJsonText(raw: string): string {
  let value = sliceJsonBlob(raw)
    .replace(/^\uFEFF/, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/,\s*$/g, "");
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of value) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if ((char === "}" || char === "]") && stack.at(-1) === char) stack.pop();
  }
  if (inString) value += '"';
  while (stack.length) value += stack.pop();
  return value.replace(/,\s*([}\]])/g, "$1");
}

export function extractJson<T>(raw: string): T {
  const attempts = [sliceJsonBlob(raw), repairJsonText(raw)];
  let lastError: unknown;
  for (const value of attempts) {
    try {
      const parsed = JSON.parse(value);
      return (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as T;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "parse error";
  throw new Error(`Gemini returned invalid JSON (${detail}).`);
}

export function friendlyGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|rate.?limit|quota|too many requests/i.test(message)) {
    return "Gemini rate limit reached. Wait a minute and try again.";
  }
  if (/401|403|api key|permission/i.test(message)) {
    return "Gemini authentication failed. Check GEMINI_API_KEY.";
  }
  return message.length > 300 ? `${message.slice(0, 300)}...` : message;
}

function stripDashes(value: string) {
  return value.replace(/\u2014|\u2013/g, "-");
}

async function generateJson(
  system: string,
  parts: GeminiPart[],
  opts?: CallOpts
) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing. Add it to .env.");
  const model = geminiModel();
  const response = await fetch(
    `${geminiBaseUrl()}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                stripDashes(system) +
                "\n\nReturn valid compact JSON only. No markdown, comments, or trailing commas.",
            },
          ],
        },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: opts?.temperature ?? 0.1,
          maxOutputTokens: opts?.maxTokens ?? 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );
  const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) {
    throw new Error(
      `Gemini request failed with status ${response.status}: ${payload.error?.message || response.statusText}`
    );
  }
  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return { text, model, finishReason: candidate?.finishReason };
}

export async function geminiTextJson<T>(
  system: string,
  user: string,
  opts?: CallOpts
): Promise<{ data: T; model: string; attempts: number }> {
  let lastError: unknown;
  const baseTokens = opts?.maxTokens ?? 4096;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const prompt =
        attempt === 1
          ? user
          : `${user}\n\nThe previous output was invalid. Return only JSON matching the requested schema.`;
      const result = await generateJson(
        system,
        [{ text: stripDashes(prompt) }],
        {
          ...opts,
          maxTokens: attempt === 1 ? baseTokens : Math.min(baseTokens + 2048, 16000),
        }
      );
      return { data: extractJson<T>(result.text), model: result.model, attempts: attempt };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(friendlyGeminiError(lastError));
}

export async function geminiVision(
  system: string,
  userText: string,
  imageDataUrl: string,
  opts?: CallOpts
) {
  const match = imageDataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Menu image must be a base64 data URL.");
  return generateJson(
    system,
    [
      { text: stripDashes(userText) },
      { inlineData: { mimeType: match[1], data: match[2] } },
    ],
    opts
  );
}
