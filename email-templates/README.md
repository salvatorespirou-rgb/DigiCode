# Cold outreach email

`outreach.html` — the designed version. `outreach.txt` — the plain-text version.
Send **both** as a multipart email. Most tools do this automatically if you paste
in each; if yours doesn't, the plain-text part still matters (see Deliverability).

---

## The one field that decides whether this works

`{{Observation}}` — a single specific, true thing about *their* site.

This is the difference between a reply and a delete. Everything else in the
email is the same for everyone, and recipients can tell. One real observation
proves a human looked.

Good:

- "It takes about six seconds to load on a phone, and Google's own research
  puts the bounce rate over 50% once you pass three."
- "The contact form doesn't submit on mobile — I tried it twice on my phone."
- "The copyright at the bottom still says 2019, which is the sort of thing a
  customer notices before they call."
- "You're on page three for 'plumber Parramatta' behind two directory sites
  that aren't even plumbers."

Bad — delete these instincts:

- "I noticed your website could use some improvements." (says nothing)
- "Your website looks outdated." (insulting, and you haven't earned it)
- Anything you haven't actually checked.

**Spend two minutes on each site before sending.** Twenty personalised emails
will beat two hundred generic ones, and won't get your domain blacklisted.

---

## Subject lines

Lowercase, specific, no marketing voice. Test a few.

1. `{{BusinessName}}'s site takes 6 seconds to load`
2. `quick note about {{BusinessName}}'s website`
3. `found a broken form on your site`   *(only if true)*
4. `{{BusinessName}} — page 3 for "{{keyword}}"`
5. `website question`

Avoid: FREE, !!!, ALL CAPS, "Dear Business Owner", "limited time", "guaranteed".
Those are what spam filters were built to catch.

---

## Australian law — this part isn't optional

The **Spam Act 2003** applies to every commercial email you send from Australia.
Three requirements:

1. **Consent.** For cold B2B, you're relying on *inferred* consent: the address
   must be publicly listed and relevant to that person's role. A "contact us"
   address on a business website qualifies. A personal Gmail scraped from
   Facebook does not.
2. **Identify yourself.** Real business name and working contact details — the
   footer covers this.
3. **A working unsubscribe.** Must work for at least 30 days and be honoured
   within 5 business days.

`{{UnsubLink}}` must be a real link. Options, cheapest first:

- Change the footer to *"reply with the word unsubscribe"* and honour it by hand
  (legal, and fine at low volume)
- Use a sending tool that supplies one automatically (see below)

Penalties are per-email and steep. Don't skip the unsubscribe.

---

## Deliverability — how not to end up in spam

**Set up SPF, DKIM and DMARC on digi-code.com.au before sending anything.**
Without these, cold email from a new domain goes almost entirely to spam. Google
Workspace walks you through DKIM; DMARC is one DNS record.

Then:

- **Warm the domain up.** It's brand new. Start at ~10 emails a day and build up
  over 3–4 weeks. Sending 500 on day one is the fastest way to burn it.
- **Send in small batches.** 20–30 a day, spaced out, not one blast.
- **One link only.** This template has the site link and the unsubscribe. Adding
  more raises the spam score.
- **Send both HTML and plain text.** A message with no plain-text part is a
  strong spam signal.
- **Don't attach anything.** Attachments on a first contact are a red flag.
- **Reply to every reply**, including the rude ones. Engagement is what teaches
  Gmail your domain is legitimate.

Worth considering: send cold outreach from a *separate* domain
(e.g. `digicode-mail.com.au`) so if it ever gets flagged, your real domain and
client email keep working.

---

## Sending it

Fine at low volume: Gmail with a mail-merge add-on, or by hand.

Better past ~30/day, since these handle unsubscribes, throttling and tracking:
Instantly, Lemlist, Smartlead, or Brevo.

**Don't** use Mailchimp for cold outreach — their terms forbid it and they'll
close the account.

---

## Following up

One follow-up, 4–5 days later, short:

> Hi {{FirstName}} — just floating this back to the top of your inbox in case it
> got buried. If it's not something you need, no hassle at all, and I won't
> chase it again.
>
> Sam

Then stop. Two emails is persistence; five is harassment, and it gets you
reported.

---

## Realistic numbers

A good cold email to a well-chosen list gets **1–5% replies**. At 30 emails a
day that's roughly one conversation a day — which for a $500–$1000 build is a
perfectly good business.

Anyone quoting better than that is either counting differently or lying. The way
to beat these numbers isn't a cleverer email, it's a **narrower list**: 20
Parramatta tradies whose sites you've actually looked at will outperform 500
random businesses every time.
