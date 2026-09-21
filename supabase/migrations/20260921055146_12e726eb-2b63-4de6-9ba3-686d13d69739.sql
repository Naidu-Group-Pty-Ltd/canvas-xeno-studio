DELETE FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;