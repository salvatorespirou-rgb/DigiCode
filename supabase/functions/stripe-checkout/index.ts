// DigiCode — create a Stripe Checkout Session.
//
// This runs on Supabase's servers, not in the visitor's browser. That is the
// whole point: STRIPE_SECRET_KEY is read from the function's environment and
// never leaves this process. The browser only ever receives a checkout URL.
//
// Deploy:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//   supabase functions deploy stripe-checkout --no-verify-jwt
//
// --no-verify-jwt is deliberate: visitors are not signed in when they buy.

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
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

/** Call a Postgres function with the service role (bypasses RLS). */
async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Stripe's API takes form encoding, including for nested fields. */
function form(obj: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) p.append(k, String(v));
  }
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!STRIPE_KEY || !SERVICE_KEY) {
    return json({ error: "Payment is not configured yet." }, 503);
  }

  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const code = typeof body?.code === "string" ? body.code.slice(0, 60) : null;
    const email = typeof body?.email === "string" ? body.email.slice(0, 200) : null;
    const name = typeof body?.name === "string" ? body.name.slice(0, 120) : null;

    if (!items.length) return json({ error: "Your cart is empty." }, 400);

    // The server prices the cart. Anything the browser claimed is ignored.
    const quote = await rpc("quote_cart", { p_items: items, p_code: code });
    const order = await rpc("create_pending_order", {
      p_items: items,
      p_code: code,
      p_email: email,
      p_name: name,
    });
    const ref = Array.isArray(order) ? order[0]?.reference : order?.reference;
    if (!ref) throw new Error("could not record the order");

    // Build the Stripe session from the server's numbers.
    const lines = quote.lines ?? [];
    const hasSub = lines.some((l: any) => l.kind === "subscription");
    const p = form({
      mode: hasSub ? "subscription" : "payment",
      success_url: `${SITE}/cart.html?paid=1&ref=${ref}`,
      cancel_url: `${SITE}/cart.html?cancelled=1`,
      client_reference_id: ref,
      "metadata[order_reference]": ref,
      customer_email: email || undefined,
      allow_promotion_codes: "false", // our own codes are already applied
    });

    let i = 0;
    for (const l of lines) {
      const isSub = l.kind === "subscription";
      // Apply the discount proportionally to the unit price so the customer is
      // charged exactly what the cart showed them.
      const gross = isSub ? quote.recurring_cents : quote.one_time_cents;
      const disc = isSub
        ? quote.discount_recurring_cents
        : quote.discount_one_time_cents;
      const factor = gross > 0 ? (gross - disc) / gross : 1;
      const unit = Math.max(1, Math.round(l.unit_cents * factor));

      p.append(`line_items[${i}][quantity]`, String(l.qty));
      p.append(`line_items[${i}][price_data][currency]`, "aud");
      p.append(`line_items[${i}][price_data][unit_amount]`, String(unit));
      p.append(`line_items[${i}][price_data][product_data][name]`, l.name);
      if (isSub) {
        p.append(
          `line_items[${i}][price_data][recurring][interval]`,
          l.bill_interval,
        );
      }
      i++;
    }

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: p,
    });

    const session = await res.json();
    if (!res.ok) {
      console.error("stripe error", session);
      return json(
        { error: session?.error?.message ?? "Stripe rejected the request." },
        502,
      );
    }

    return json({ url: session.url, reference: ref });
  } catch (err) {
    console.error(err);
    return json({ error: "Could not start checkout. Please try again." }, 500);
  }
});
