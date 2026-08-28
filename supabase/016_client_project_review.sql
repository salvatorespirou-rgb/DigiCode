-- DigiCode — Phase 2e: let a client leave a review on their finished project.
-- Run this once in the Supabase SQL Editor, after 015_portal_login_identifier.sql.
--
-- The dev side already renders a review on the project card and says "No
-- customer review submitted yet" when there isn't one — but nothing has ever
-- been able to write it, because clients only hold a SELECT policy on
-- `projects`. This adds the missing half.
--
-- It's a function rather than an UPDATE policy on purpose. Granting clients
-- update rights on the row would let them edit status, assigned_dev, tiers
-- and everything else on it; this can only ever write the `review` column.
--
-- Guards: you must be signed in as the project's own client, the project must
-- actually be finished, and the rating has to be 1-5. Reviewing again
-- overwrites the previous one, so a client can fix a typo or change their
-- mind rather than being stuck with their first attempt.

create or replace function public.submit_project_review(
  project_id text,
  rating int,
  review_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text := auth.jwt() ->> 'email';
begin
  if caller_email is null then
    raise exception 'Not signed in';
  end if;

  if rating is null or rating < 1 or rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  update public.projects
     set review = jsonb_build_object(
           'rating', rating,
           'text', coalesce(left(trim(review_text), 2000), ''),
           'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
         )
   where id = project_id
     and lower(client_email) = lower(caller_email)
     and status = 'finished';

  if not found then
    raise exception 'No finished project of yours matches that id';
  end if;
end;
$$;

revoke all on function public.submit_project_review(text, int, text) from public;
grant execute on function public.submit_project_review(text, int, text) to authenticated;
