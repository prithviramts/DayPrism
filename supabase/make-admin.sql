-- Run once in the Supabase SQL editor AFTER you have registered in the app with your own email.
-- Replace the address below with the one you registered with. Admins get the Admin screen
-- (user list, stats, demo data in their own account). Admins can never read other users' entries.

update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');

-- Check:
-- select u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';
