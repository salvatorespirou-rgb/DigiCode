// DigiCode — confirm an order straight from Stripe, as a safety net.
//
// The webhook is the primary path and stays the source of truth. But it is a
// single point of failure with no fallback: if it is misconfigured, or its
// signing secret drifts, a customer pays and gets nothing, the order sits
// 'pending' forever, and nobody finds out. That is exactly what happened —
// sixteen orders, not one of them ever marked paid, discovered only because
// a buyer complained.
//
// So the success page also asks here. This function does not trust the
// browser: it takes an order reference, looks up the Stripe Checkout Session
// recorded against that order, and asks Stripe's own API whether it was
// actually paid. Only Stripe's answer marks the order paid — the same
// mark_order_paid the webhook calls, which is idempotent, so whichever
// arrives first wins and the second is a no-op.
//
// Deploy:
//   supabase functions deploy confirm-order --no-verify-jwt
// (no JWT: buyers are not signed in on the success page)

function envAny(...names: string[]) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return "";
}

const STRIPE_KEY = envAny("STRIPE_SECRET_KEY", "digicode ontime payment");
const STRIPE_SUB_KEY = envAny("STRIPE_SUBSCRIPTION_KEY", "digicode sub key");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://www.digi-code.com.au";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ask Stripe about one session. Tries both keys, because a cart with a plan
 *  was created with the subscription key and the one-off key can't read it. */
async function getSession(sessionId: string) {
  for (const key of [STRIPE_KEY, STRIPE_SUB_KEY]) {
    if (!key) continue;
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (res.ok) return await res.json();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SERVICE_KEY || (!STRIPE_KEY && !STRIPE_SUB_KEY)) {
    return json({ error: "Not configured." }, 503);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reference = String(body?.reference ?? "").trim();
    if (!UUID.test(reference)) return json({ error: "Invalid reference." }, 400);

    const head = {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    };

    const orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?reference=eq.${reference}&select=status,checkout_session_id,stripe_session_id`,
      { headers: head },
    );
    if (!orderRes.ok) throw new Error(`order lookup ${orderRes.status}`);
    const order = (await orderRes.json())[0];

    // Same answer for "no such order" as for anything else a caller has no
    // business knowing about.
    if (!order) return json({ paid: false });
    if (order.status === "paid") return json({ paid: true });

    // checkout_session_id is stamped when the session is created, so this
    // works even though the order was never paid — stripe_session_id is only
    // written once mark_order_paid runs.
    const sessionId = order.checkout_session_id || order.stripe_session_id;
    if (!sessionId) return json({ paid: false });

    const session = await getSession(sessionId);
    if (!session) return json({ paid: false });

    // Never take the browser's word for which order a session belongs to.
    const claimedRef = session.metadata?.order_reference ?? session.client_reference_id;
    if (claimedRef !== reference) {
      console.error("session/order mismatch", sessionId, claimedRef, reference);
      return json({ paid: false });
    }

    const settled =
      session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (!settled) return json({ paid: false });

    // Stripe says it's paid and the session really is this order's. Same
    // idempotent function the webhook calls.
    const markRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mark_order_paid`, {
      method: "POST",
      headers: head,
      body: JSON.stringify({ p_reference: reference, p_session: session.id ?? null }),
    });

    if (!markRes.ok) {
      console.error("mark_order_paid failed", markRes.status, await markRes.text());
      return json({ paid: false });
    }

    console.log("confirm-order rescued an unpaid-but-settled order", reference);
    return json({ paid: true, rescued: true });
  } catch (err) {
    console.error(err);
    return json({ paid: false });
  }
});
