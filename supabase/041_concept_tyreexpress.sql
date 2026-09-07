-- DigiCode — register the Tyre Express concept build
-- Run this in the Supabase SQL Editor after 040_concept_builds.sql.
--
-- One row. The same thing can be done from the portal's Concept Builds tab
-- using the "Add a concept build" form; this exists so the register can be
-- rebuilt from the migrations alone if the database is ever restored.
--
-- Seeded HIDDEN on purpose. The build carries the business's own shopfront
-- and workshop photographs and a brand list that has not been confirmed with
-- the owner, so it stays off the public concepts page until they approve it.

insert into public.concept_builds (name, client, slug, url, summary, status)
values (
  'Tyre Express',
  'Tyre Express — South Granville',
  'tyreexpress',
  'concepts/tyreexpress/index.html',
  'Tyres, alignment and mechanical. Black/white/orange from their shopfront, with a wheel drawn in CSS that turns on scroll. Brands and opening hours still need confirming with the owner — see the build''s README.',
  'hidden'
)
on conflict do nothing;
