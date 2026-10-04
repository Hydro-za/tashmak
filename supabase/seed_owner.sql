-- Run ONCE in the Supabase SQL editor after the migrations. Creates the initial Owner with NO password.
-- Then open the app's /login page and use "Forgot password (Owner)" to set one by email.
-- Change the email below first. There is deliberately no public "create owner" screen in the app.
do $b$
declare uid uuid := gen_random_uuid(); owner_email text := 'owner@example.com';   -- <<< CHANGE ME
begin
  if exists (select 1 from auth.users where lower(email) = lower(owner_email)) then raise notice 'owner exists'; return; end if;
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', owner_email, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', '', '', false);
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', owner_email, 'email_verified', true), 'email', uid::text, now(), now(), now());
  insert into public.profiles (id, username, full_name, role, active) values (uid, 'owner', 'Owner', 'owner', true);
end $b$;
