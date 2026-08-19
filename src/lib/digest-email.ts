/**
 * Build morning digest email (HTML + plain text).
 */

export type DigestEmailPayload = {
  date: string;
  verdict: string;
  headline: string;
  summary: string;
  score: number;
  recommended: { name: string; reason?: string }[];
  avoid: { name: string; reason?: string }[];
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listText(
  title: string,
  items: { name: string; reason?: string }[],
  limit = 5
) {
  const slice = items.slice(0, limit);
  if (!slice.length) return `${title}\n  (none)\n`;
  return (
    `${title}\n` +
    slice
      .map((i) => `  · ${i.name}${i.reason ? ` — ${i.reason}` : ""}`)
      .join("\n") +
    "\n"
  );
}

function listHtml(
  title: string,
  items: { name: string; reason?: string }[],
  limit = 5
) {
  const slice = items.slice(0, limit);
  if (!slice.length) {
    return `<h3 style="margin:16px 0 8px;font-size:14px;color:#6e6e73;">${escapeHtml(title)}</h3><p style="color:#6e6e73;font-size:14px;">None listed</p>`;
  }
  const lis = slice
    .map(
      (i) =>
        `<li style="margin:0 0 6px;"><strong>${escapeHtml(i.name)}</strong>${
          i.reason
            ? ` <span style="color:#6e6e73;">— ${escapeHtml(i.reason)}</span>`
            : ""
        }</li>`
    )
    .join("");
  return `<h3 style="margin:16px 0 8px;font-size:14px;color:#6e6e73;">${escapeHtml(title)}</h3><ul style="margin:0;padding-left:18px;">${lis}</ul>`;
}

export function buildDigestEmail(opts: {
  userName?: string;
  payload: DigestEmailPayload;
  appUrl?: string;
}) {
  const { payload } = opts;
  const name = opts.userName?.trim() || "there";
  const base = (
    opts.appUrl ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const todayUrl = `${base}/today`;

  const subject = `MealWorks · ${payload.date} · Fit ${payload.score}`;

  const text = [
    `Hi ${name},`,
    ``,
    payload.headline,
    payload.summary,
    ``,
    `Fit score: ${payload.score}`,
    `Date: ${payload.date}`,
    ``,
    listText("Good picks", payload.recommended),
    listText("Skip", payload.avoid),
    `Open Today: ${todayUrl}`,
    ``,
    `— MealWorks`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;">
  <div style="max-width:560px;margin:24px auto;padding:28px 24px;background:#ffffff;border-radius:16px;border:1px solid #e5e5ea;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#6e6e73;">MealWorks · ${escapeHtml(payload.date)}</p>
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.25;letter-spacing:-0.02em;">${escapeHtml(payload.headline)}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3a3a3c;">${escapeHtml(payload.summary)}</p>
    <p style="margin:0 0 20px;font-size:14px;color:#6e6e73;">Fit <strong style="color:#111;">${payload.score}</strong> · Hi ${escapeHtml(name)}</p>
    ${listHtml("Good picks", payload.recommended)}
    ${listHtml("Skip", payload.avoid)}
    <p style="margin:28px 0 0;">
      <a href="${escapeHtml(todayUrl)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:600;">Open Today</a>
    </p>
  </div>
  <p style="text-align:center;font-size:12px;color:#8e8e93;margin:12px 0 24px;">You’re receiving this because you enabled morning digests.</p>
</body>
</html>`;

  return { subject, text, html };
}
