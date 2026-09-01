// TEMPORARY diagnostic. Lists environment variable NAMES only — never values —
// so we can see which secret names the runtime actually exposes. Delete once
// the Stripe keys are confirmed readable.
Deno.serve(() => {
  const names = Object.keys(Deno.env.toObject()).sort();
  return new Response(JSON.stringify({ names }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
