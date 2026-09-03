-- DigiCode — accept the archive types browsers actually report
-- Run this in the Supabase SQL Editor after 028_script_images.sql.
--
-- Two fixes.
--
-- 1. MIME types. A browser reports whatever the operating system has in its
--    registry for that extension, and for archives that varies wildly. A .zip
--    can arrive as application/zip, application/x-zip-compressed,
--    application/x-compressed, multipart/x-zip or application/octet-stream
--    depending on the machine. Listing only some of them means uploads fail on
--    some computers and not others, which is a miserable thing to debug.
--
-- 2. Size. The bucket said 200 MB, but the project is on the Free plan, which
--    caps every upload at 50 MB no matter what a bucket claims. A limit that
--    lies produces a confusing failure at 51 MB; one that matches reality
--    produces an honest one. Raise this to match if the project moves to Pro.

alter table public.script_products
  add column if not exists file_notes text;

update storage.buckets
   set file_size_limit    = 52428800,        -- 50 MB: the Free plan ceiling
       allowed_mime_types = array[
         -- zip, as reported by various systems
         'application/zip',
         'application/x-zip-compressed',
         'application/x-zip',
         'application/x-compressed',
         'multipart/x-zip',
         -- rar
         'application/x-rar-compressed',
         'application/vnd.rar',
         'application/rar',
         -- 7z
         'application/x-7z-compressed',
         -- tar / gzip, for anyone packaging on Linux or macOS
         'application/x-tar',
         'application/gzip',
         'application/x-gzip',
         'application/x-bzip2',
         -- the catch-all a browser falls back to when it has no idea
         'application/octet-stream'
       ]
 where id = 'script-files';
