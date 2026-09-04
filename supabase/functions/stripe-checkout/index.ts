// DigiCode — create a Stripe Checkout Session.
//
// This runs on Supabase's servers, not in the visitor's browser. That is the
// whole point: STRIPE_SECRET_KEY is read from the function's environment and
// never leaves this process. The browser only ever receives a checkout URL.
//
// Deploy:
//   supabase secrets set STRIPE_SECRET_KEY=rk_test_...        (one-off carts)
//   supabase secrets set STRIPE_SUBSCRIPTION_KEY=rk_test_...  (carts with a plan)
//   supabase functions deploy stripe-checkout --no-verify-jwt
//
// --no-verify-jwt is deliberate: visitors are not signed in when they buy.

// Two separately scoped keys. The one-off key cannot create subscriptions and
// the subscription key is only reachable by a cart that contains a plan, so a
// leak of either is limited to what that key can do.
//
// Each is looked up under a couple of names: the canonical one, plus the name
// the secret was originally stored under in this project. Supabase's edit
// dialog will not rename a secret without re-entering its value, so rather
// than have anyone handle the key again we just read whichever exists.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  if ((!STRIPE_KEY && !STRIPE_SUB_KEY) || !SERVICE_KEY) {
    return json({ error: "Payment is not configured yet." }, 503);
  }

  try {
    const body = await req.json();

    // ---- Paying a priced quote -------------------------------------------
    //
    // A different shape of purchase to a cart: there are no SKUs, because a
    // lead developer wrote the lines by hand in the portal. The rule is
    // unchanged though — the browser sends only the reference, and the amount
    // is read out of the invoices table here. A caller who edits the number
    // in dev tools is sending a field this branch never looks at.
    const invoiceRef = typeof body?.invoice === "string" ? body.invoice.trim() : "";
    if (invoiceRef) {
      if (!UUID.test(invoiceRef)) return json({ error: "Invalid payment link." }, 400);
      if (!STRIPE_KEY) return json({ error: "Payment is not configured yet." }, 503);

      const rows = await rpc("invoice_for_payment", { p_reference: invoiceRef });
      const inv = Array.isArray(rows) ? rows[0] : rows;

      // Same answer for "no such invoice", "still a draft" and "cancelled" —
      // a link that isn't payable gives nothing away about why.
      if (!inv) return json({ error: "That payment link isn't valid." }, 404);
      if (inv.status === "paid") {
        return json({ error: "That invoice has already been paid.", paid: true }, 409);
      }
      if (!inv.total_cents || inv.total_cents < 50) {
        return json({ error: "That invoice has no amount to pay." }, 400);
      }

      const ip = form({
        mode: "payment",
        success_url: `${SITE}/invoice.html?ref=${invoiceRef}&paid=1`,
        cancel_url: `${SITE}/invoice.html?ref=${invoiceRef}`,
        client_reference_id: invoiceRef,
        "metadata[invoice_reference]": invoiceRef,
        allow_promotion_codes: "false",
      });

      // Any discount is already inside total_cents, so it is spread across the
      // lines the same way the cart does it — the customer is charged exactly
      // the total the invoice showed them.
      const ilines = Array.isArray(inv.lines) ? inv.lines : [];
      const gross = Number(inv.subtotal_cents) || 0;
      const factor = gross > 0 ? Number(inv.total_cents) / gross : 1;

      let n = 0;
      for (const l of ilines) {
        const unit = Math.max(1, Math.round((Number(l.unit_cents) || 0) * factor));
        ip.append(`line_items[${n}][quantity]`, String(Number(l.qty) || 1));
        ip.append(`line_items[${n}][price_data][currency]`, inv.currency || "aud");
        ip.append(`line_items[${n}][price_data][unit_amount]`, String(unit));
        ip.append(
          `line_items[${n}][price_data][product_data][name]`,
          String(l.description || "Service").slice(0, 250),
        );
        n++;
      }
      if (!n) return json({ error: "That invoice has nothing on it." }, 400);

      const ires = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: ip,
      });

      const isession = await ires.json();
      if (!ires.ok) {
        console.error("stripe error (invoice)", isession);
        return json(
          { error: isession?.error?.message ?? "Stripe rejected the request." },
          502,
        );
      }

      return json({ url: isession.url, reference: invoiceRef });
    }

    // ---- Paying for a cart ------------------------------------------------
    const items = Array.isArray(body?.items) ? body.items : [];
    const code = typeof body?.code === "string" ? body.code.slice(0, 60) : null;
    const email = typeof body?.email === "string" ? body.email.slice(0, 200) : null;
    const name = typeof body?.name === "string" ? body.name.slice(0, 120) : null;
    // Extra context a buyer gave beyond name/email — right now that's only a
    // cfx.re account name for a CFX Scripts / MLOs purchase, but it's kept
    // generic since any future one-off item needs the same shape.
    const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;

    if (!items.length) return json({ error: "Your cart is empty." }, 400);

    // The server prices the cart. Anything the browser claimed is ignored.
    const quote = await rpc("quote_cart", { p_items: items, p_code: code });
    const order = await rpc("create_pending_order", {
      p_items: items,
      p_code: code,
      p_email: email,
      p_name: name,
      p_note: note,
    });
    const ref = Array.isArray(order) ? order[0]?.reference : order?.reference;
    if (!ref) throw new Error("could not record the order");

    // Build the Stripe session from the server's numbers.
    const lines = quote.lines ?? [];
    const hasSub = lines.some((l: any) => l.kind === "subscription");
    const hasScript = lines.some((l: any) => String(l.sku || "").startsWith("script:"));

    // Pick the key scoped to what this cart actually is. A cart with a plan
    // needs the subscription key; without it we refuse the whole cart rather
    // than charging the build and silently dropping the plan — the site falls
    // back to the email order.
    const key = hasSub ? STRIPE_SUB_KEY : STRIPE_KEY;
    if (!key) {
      return json(
        {
          error: hasSub
            ? "Subscriptions are not available for card payment yet."
            : "Payment is not configured yet.",
          subscriptions_disabled: hasSub,
        },
        hasSub ? 409 : 503,
      );
    }
    const p = form({
      mode: hasSub ? "subscription" : "payment",
      // A script order returns to the store, which is where the download
      // link is shown; everything else goes back to the cart.
      success_url: hasScript
        ? `${SITE}/scripts.html?paid=1&ref=${ref}`
        : `${SITE}/cart.html?paid=1&ref=${ref}`,
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
        Authorization: `Bearer ${key}`,
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

    // Stamp the session onto the order now, while it is still pending. This
    // is what lets confirm-order ask Stripe "was this ever actually paid?"
    // about an order the webhook never got to — without it, a webhook
    // failure leaves an order with no way back to the payment that settled
    // it. Best-effort: a failure here must not cost the customer a checkout
    // they are already on their way to.
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/orders?reference=eq.${ref}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ checkout_session_id: session.id }),
      });
    } catch (err) {
      console.error("could not stamp checkout_session_id", err);
    }

    return json({ url: session.url, reference: ref });
  } catch (err) {
    console.error(err);
    return json({ error: "Could not start checkout. Please try again." }, 500);
  }
});
