-- Create a new storage bucket for organization assets
insert into storage.buckets (id, name, public)
values ('organization-assets', 'organization-assets', true)
on conflict (id) do nothing;

-- Policy to allow authenticated users to upload files
create policy "Allow authenticated users to upload assets"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'organization-assets' );

-- Policy to allow public to view assets
create policy "Allow public to view assets"
on storage.objects for select
to public
using ( bucket_id = 'organization-assets' );

-- Policy to allow users to update their own assets (or all auth users for now as it's org based)
create policy "Allow users to update assets"
on storage.objects for update
to authenticated
using ( bucket_id = 'organization-assets' );

-- Policy to allow users to delete assets
create policy "Allow users to delete assets"
on storage.objects for delete
to authenticated
using ( bucket_id = 'organization-assets' );
