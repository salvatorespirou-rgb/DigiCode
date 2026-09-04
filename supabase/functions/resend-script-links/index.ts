// DigiCode — recover a lost Google Drive script link.
//
// A buyer who lost the success-page tab, or deleted the confirmation email,
// has no self-service way back to their purchase otherwise — there's no
// account system, no "my purchases" page. This is that recovery path: give
// an email, and if it's tied to a paid Drive-delivered script, get a fresh
// email with the same permanent link.
//
// The response is identical whether anything was found or not, for the same
// reason invoice_for_payment gives the same answer for "doesn't exist" and
// "isn't paid" — a public lookup-by-email endpoint that echoed back "found"
// or "not found" would let anyone enumerate which addresses have bought
// something here. A cooldown (script_link_resend_log) stops it being used as
// a mail cannon against an address that isn't the caller's.
//
// Deploy:
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase functions deploy resend-script-links --no-verify-jwt
// (no JWT: a buyer recovering their link is not signed in)

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://www.digi-code.com.au";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = Deno.env.get("EMAIL_FROM") ?? "DigiCode <orders@mail.digi-code.com.au>";

const COOLDOWN_MS = 10 * 60 * 1000; // ten minutes between requests for the same address

const CORS = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]));
}

/** Table-based, inline-styled — runs through email clients, not browsers. */
function emailHtml(heading: string, intro: string, items: { name: string; url: string }[]) {
  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e2e6ea;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#0B0F1A;">${esc(i.name)}</div>
          <a href="${esc(i.url)}" style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6D4EE8;">Open in Google Drive &rarr;</a>
        </td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>DigiCode</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;">
<tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e6ea;">
  <tr><td align="center" style="background:#0B0F1A;padding:26px 24px;">
    <img src="https://www.digi-code.com.au/assets/images/digicode-logo.png" width="64" height="64" alt="DigiCode" style="display:block;border:0;width:64px;height:64px;" />
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:18px;line-height:24px;font-weight:700;color:#ffffff;letter-spacing:1.5px;padding-top:10px;">DIGICODE</div>
  </td></tr>
  <tr><td style="padding:30px 28px 10px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#0B0F1A;padding-bottom:6px;">${esc(heading)}</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:#4b5563;">${intro}</div>
  </td></tr>
  <tr><td style="padding:6px 28px 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
  </td></tr>
  <tr><td style="padding:14px 28px 30px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#8a94a3;">
      Any trouble at all, reply to this email or write to
      <a href="mailto:developerteam@digi-code.com.au" style="color:#6D4EE8;">developerteam@digi-code.com.au</a>.
    </div>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set — recovery email not sent");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    });
    if (!res.ok) console.error("resend send failed", res.status, await res.text());
  } catch (err) {
    console.error("resend send threw", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Always the same shape back, on every path from here — found or not,
  // rate-limited or not, even on an internal error. Nothing about the
  // response should tell a caller anything about whether an address has
  // ever bought something here.
  const GENERIC = {
    ok: true,
    message: "If we found a purchase for that email, a fresh copy is on its way.",
  };

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (!SERVICE_KEY) return json(GENERIC); // not configured — fail closed and quiet

    const head = {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    };

    // Rate limit: at most one send per address per cooldown window. Checked
    // and stamped as two separate calls rather than one atomic upsert — the
    // worst a race does is let two sends through instead of one, which is
    // well within what this cooldown needs to guard against.
    const logRes = await fetch(
      `${SUPABASE_URL}/rest/v1/script_link_resend_log?email=eq.${encodeURIComponent(email)}&select=last_requested_at`,
      { headers: head },
    );
    const logRows = logRes.ok ? await logRes.json() : [];
    const last = logRows[0]?.last_requested_at ? new Date(logRows[0].last_requested_at).getTime() : 0;
    if (Date.now() - last < COOLDOWN_MS) {
      return json(GENERIC);
    }

    await fetch(`${SUPABASE_URL}/rest/v1/script_link_resend_log`, {
      method: "POST",
      headers: { ...head, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ email, last_requested_at: new Date().toISOString() }),
    });

    // Only Drive-delivered purchases are recoverable this way — a
    // file-hosted download uses a signed URL that expires in minutes, so
    // there is nothing stable to re-send for one of those.
    const purchasesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/script_purchases?buyer_email=eq.${encodeURIComponent(email)}` +
        `&select=script_products(name,drive_url)`,
      { headers: head },
    );

    if (purchasesRes.ok) {
      const purchases = await purchasesRes.json();

      const items = (Array.isArray(purchases) ? purchases : [])
        .map((p: any) => p.script_products)
        .filter((s: any) => s && s.drive_url)
        .map((s: any) => ({ name: s.name as string, url: s.drive_url as string }));

      if (items.length) {
        const html = emailHtml(
          "Here's what you're looking for",
          "You asked us to resend your Google Drive links — here they are.",
          items,
        );
        await sendEmail(email, "Your DigiCode download links", html);
      }
    }

    return json(GENERIC);
  } catch (err) {
    console.error(err);
    return json(GENERIC);
  }
});
