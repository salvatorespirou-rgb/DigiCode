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
  const ref = session.client_reference_id ?? session.metadata?.order_reference;
  if (!ref) return new Response("no reference", { status: 200 });

  // mark_order_paid is idempotent, so Stripe's retries are safe.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mark_order_paid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ p_reference: ref, p_session: session.id ?? null }),
  });

  if (!res.ok) {
    console.error("mark_order_paid failed", res.status, await res.text());
    // 500 tells Stripe to retry rather than silently losing the payment.
    return new Response("retry", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
