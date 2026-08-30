-- DigiCode — lets Devs delete files from the avatars bucket (cleanup).
create policy "Devs can delete avatars"
  on storage.objects for delete
  using (bucket_id = 'avatars' and public.is_dev());
