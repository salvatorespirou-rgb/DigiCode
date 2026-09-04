/* DigiCode — recover a lost Google Drive script link.
 *
 * Posts an email to the resend-script-links Edge Function and always shows
 * the same "if we found something, check your inbox" message — the function
 * itself gives the same answer whether or not a match exists, so this page
 * never reveals which emails have bought something here.
 */
(function () {
  "use strict";

  var form = document.getElementById("recoverForm");
  if (!form) return;

  var RESEND_FN =
    "https://phlmnlildwkkichlbtoy.supabase.co/functions/v1/resend-script-links";

  var errorEl = document.getElementById("recoverError");
  var statusEl = document.getElementById("recoverStatus");
  var submitBtn = document.getElementById("recoverSubmit");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorEl.hidden = true;
    statusEl.hidden = true;

    var email = document.getElementById("recoverEmail").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = "Enter a valid email address.";
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      var res = await fetch(RESEND_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: email }),
      });
      var data = await res.json().catch(function () { return {}; });

      if (!res.ok) throw new Error(data.error || "request failed");

      statusEl.textContent =
        "If we found a purchase for that email, a fresh copy is on its way — check your inbox " +
        "(and spam folder) in the next few minutes.";
      statusEl.hidden = false;
      form.reset();
    } catch (e) {
      errorEl.textContent =
        "Couldn't send that just now. Try again in a moment, or email " +
        "developerteam@digi-code.com.au and we'll sort it out.";
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send my link";
    }
  });
})();
