// DigiCode — hand a paying customer their script file.
//
// The bucket is private and has no read policy for customers, so the only way
// to the file is through here. This function checks the token belongs to a
// paid order, then mints a signed URL that expires in five minutes. The
// storage key is never sent to the browser, and a URL that leaks is dead
// almost immediately.
//
// Deploy:
//   supabase functions deploy script-download --no-verify-jwt
// (no JWT: buyers are not signed in when they download from the success page)

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://www.digi-code.com.au";
const BUCKET = "script-files";
const EXPIRES_IN = 300; // seconds

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SERVICE_KEY) return json({ error: "Downloads are not configured yet." }, 503);

  try {
    const body = await req.json();
    const token = String(body?.token ?? "");

    // Cheap shape check before touching the database.
    if (!UUID.test(token)) return json({ error: "Invalid download link." }, 400);

    const head = {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    };

    // redeem_download only returns a row when the token belongs to an order
    // that is actually marked paid.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_download`, {
      method: "POST",
      headers: head,
      body: JSON.stringify({ p_token: token }),
    });

    if (!res.ok) throw new Error(`redeem_download ${res.status}`);
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;

    if (!row?.file_path && !row?.drive_url) {
      // Same answer for "never existed" and "not paid for" — no probing.
      return json({ error: "That download link isn't valid." }, 404);
    }

    // Delivered by Drive: hand over the link. Unlike a signed URL this cannot
    // expire, which is the trade the seller accepted to ship files over 50MB.
    if (!row.file_path && row.drive_url) {
      return json({
        url: row.drive_url,
        fileName: row.file_name ?? "",
        delivery: "drive",
      });
    }

    const signRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${row.file_path}`,
      {
        method: "POST",
        headers: head,
        body: JSON.stringify({ expiresIn: EXPIRES_IN }),
      },
    );

    if (!signRes.ok) {
      console.error("sign failed", signRes.status, await signRes.text());
      return json({ error: "Couldn't prepare that download. Try again." }, 502);
    }

    const signed = await signRes.json();
    const path = String(signed.signedURL ?? signed.signedUrl ?? "");
    if (!path) return json({ error: "Couldn't prepare that download." }, 502);

    return json({
      url: `${SUPABASE_URL}/storage/v1${path}`,
      fileName: row.file_name ?? "script.zip",
      expiresIn: EXPIRES_IN,
      delivery: "file",
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
