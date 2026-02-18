-- consolidated registration fix
-- run this in supabase sql editor

-- 1. robust handle new user (auth.users -> profiles)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, whatsapp)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'new user'),
    coalesce(new.raw_user_meta_data->>'role', 'provider'),
    new.raw_user_meta_data->>'whatsapp'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    whatsapp = excluded.whatsapp;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 2. robust handle admin business (profiles -> businesses)
create or replace function public.handle_new_admin_business()
returns trigger as $$
declare
    v_business_id uuid;
begin
  -- only run for admins who don't have a business_id yet
  if new.role = 'Admin' and new.business_id is null then
    -- check if a business already exists for this owner to prevent duplicates on retries
    select id into v_business_id from public.businesses where owner_id = new.id limit 1;
    
    if v_business_id is null then
        -- create the business
        insert into public.businesses (name, owner_id)
        values (coalesce(new.full_name, 'new admin') || '''s business', new.id)
        returning id into v_business_id;
    end if;

    -- update the profile that was just created
    update public.profiles 
    set business_id = v_business_id 
    WHERE id = NEW.id AND (business_id IS NULL OR business_id != v_business_id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3. re-attach triggers correctly
-- ensure auth trigger exists
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ensure admin business trigger exists as after insert
drop trigger if exists tr_new_admin_business on public.profiles;
create trigger tr_new_admin_business
  after insert on public.profiles
  for each row execute function public.handle_new_admin_business();
