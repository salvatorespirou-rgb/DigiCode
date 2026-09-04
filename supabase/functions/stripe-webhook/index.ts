// DigiCode — Stripe webhook receiver.
//
// Stripe calls this when a payment completes. It is the ONLY thing that marks
// an order paid: the browser returning to a success URL proves nothing (anyone
// can visit that URL), so the money is only ever confirmed by Stripe itself,
// over a signed request we verify here.
//
// Deploy:
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//   supabase functions deploy stripe-webhook --no-verify-jwt
// Then in Stripe: Developers > Webhooks > add endpoint
//   https://<project>.supabase.co/functions/v1/stripe-webhook
//   event: checkout.session.completed

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://www.digi-code.com.au";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = Deno.env.get("EMAIL_FROM") ?? "DigiCode <orders@mail.digi-code.com.au>";

/** Constant-time compare, so a wrong signature can't be guessed by timing. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Verify Stripe's `Stripe-Signature` header. */
async function verify(body: string, header: string | null) {
  if (!header) return false;

  // While a signing secret is being rolled, Stripe signs with both the old and
  // the new one and sends several v1 values in the same header. Collecting
  // them all — rather than keeping whichever happened to come last — is what
  // stops payments being dropped during a rotation.
  let t = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") signatures.push(v);
  }

  if (!t || !signatures.length) return false;

  // Reject replays of an old signed payload.
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = await hmac(WEBHOOK_SECRET, `${t}.${body}`);
  return signatures.some((sig) => safeEqual(expected, sig));
}

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]));
}

/** Table-based, inline-styled — the same reasoning as email-templates/outreach.html: this
 *  runs through email clients, not browsers, so no flex/grid, no <style> block. */
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
      Save these links somewhere safe. If you ever lose them, you can request a fresh copy any
      time at <a href="${SITE}/recover-scripts.html" style="color:#6D4EE8;">${SITE.replace(/^https?:\/\//, "")}/recover-scripts.html</a>.
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
    console.error("RESEND_API_KEY not set — purchase confirmation not sent");
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

/** Drive-delivered items only — a file-hosted download is a signed URL that
 *  expires in minutes, so there's nothing stable to put in an email for one
 *  of those. CFX Scripts / MLOs have their own separate manual-transfer flow. */
async function sendPurchaseConfirmation(orderRef: string) {
  try {
    const head = {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    };

    const orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?reference=eq.${orderRef}&select=customer_email`,
      { headers: head },
    );
    if (!orderRes.ok) throw new Error(`order lookup ${orderRes.status}`);
    const orderRows = await orderRes.json();
    const email = orderRows[0]?.customer_email;
    if (!email) return; // no address on file — nothing to send to

    const purchasesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/script_purchases?order_reference=eq.${orderRef}` +
        `&select=script_products(name,drive_url)`,
      { headers: head },
    );
    if (!purchasesRes.ok) throw new Error(`purchases lookup ${purchasesRes.status}`);
    const purchases = await purchasesRes.json();

    const items = (Array.isArray(purchases) ? purchases : [])
      .map((p: any) => p.script_products)
      .filter((s: any) => s && s.drive_url)
      .map((s: any) => ({ name: s.name as string, url: s.drive_url as string }));

    if (!items.length) return; // nothing Drive-delivered in this order

    const html = emailHtml(
      "Thanks for your purchase",
      "Your payment went through — here's your download.",
      items,
    );
    await sendEmail(email, "Your DigiCode purchase", html);
  } catch (err) {
    // Never lets an email problem turn into a Stripe retry of the whole
    // webhook — the payment itself is already recorded by this point.
    console.error("sendPurchaseConfirmation failed", err);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (!WEBHOOK_SECRET || !SERVICE_KEY) {
    return new Response("not configured", { status: 503 });
  }

  const raw = await req.text();

  if (!(await verify(raw, req.headers.get("Stripe-Signature")))) {
    // Not from Stripe, or tampered with, or stale.
    return new Response("bad signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("ignored", { status: 200 });
  }

  const session = event.data?.object ?? {};

  // Two things can be paid for here, and they settle in different tables.
  // A priced quote carries invoice_reference; a shop order carries
  // order_reference. The metadata is set by stripe-checkout, so a session
  // that has neither is not ours to act on.
  const invoiceRef = session.metadata?.invoice_reference;
  const orderRef = session.metadata?.order_reference ?? session.client_reference_id;

  const fn = invoiceRef ? "mark_invoice_paid" : "mark_order_paid";
  const ref = invoiceRef ?? orderRef;
  if (!ref) return new Response("no reference", { status: 200 });

  const restHead = {
    "Content-Type": "application/json",
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };

  // Stripe can and does redeliver this event — mark_order_paid handles that
  // by no-op'ing once an order is already 'paid', but a confirmation email
  // has no equivalent built-in guard. Checked before the call, not after, so
  // a redelivery of an already-paid order is recognised and skipped rather
  // than sending a second "thanks for your purchase" for the same order.
  let wasAlreadyPaid = true;
  if (!invoiceRef) {
    try {
      const check = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?reference=eq.${orderRef}&select=status`,
        { headers: restHead },
      );
      const rows = check.ok ? await check.json() : [];
      wasAlreadyPaid = rows[0]?.status === "paid";
    } catch {
      wasAlreadyPaid = true; // unsure — err toward not sending a duplicate
    }
  }

  // Both functions are idempotent, so Stripe's retries are safe.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: restHead,
    body: JSON.stringify({ p_reference: ref, p_session: session.id ?? null }),
  });

  if (!res.ok) {
    console.error(`${fn} failed`, res.status, await res.text());
    // 500 tells Stripe to retry rather than silently losing the payment.
    return new Response("retry", { status: 500 });
  }

  if (fn === "mark_order_paid" && !wasAlreadyPaid) {
    await sendPurchaseConfirmation(orderRef);
  }

  return new Response("ok", { status: 200 });
});
