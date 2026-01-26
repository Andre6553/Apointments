-- Disable trigger logic by making them do nothing
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_new_admin_business()
RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
