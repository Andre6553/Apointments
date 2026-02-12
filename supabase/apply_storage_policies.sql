-- Run this in your Supabase Dashboard -> SQL Editor

-- 1. Allow authenticated users to upload assets (Required for Broadcasting)
create policy "Allow authenticated users to upload assets"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'organization-assets' );

-- 2. Allow public to view assets (Already enabled by public bucket, but good to have)
create policy "Allow public to view assets"
on storage.objects for select
to public
using ( bucket_id = 'organization-assets' );

-- 3. Allow users to update their own assets
create policy "Allow users to update assets"
on storage.objects for update
to authenticated
using ( bucket_id = 'organization-assets' );

-- 4. Allow users to delete assets
create policy "Allow users to delete assets"
on storage.objects for delete
to authenticated
using ( bucket_id = 'organization-assets' );
