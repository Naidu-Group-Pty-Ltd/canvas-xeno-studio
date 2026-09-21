ALTER TABLE public.projects ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.asset_folders ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.generations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.usage_ledger ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.projects DROP CONSTRAINT projects_created_by_fkey,
  ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.asset_folders DROP CONSTRAINT asset_folders_created_by_fkey,
  ADD CONSTRAINT asset_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.generations DROP CONSTRAINT generations_user_id_fkey,
  ADD CONSTRAINT generations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.assets DROP CONSTRAINT assets_uploaded_by_fkey,
  ADD CONSTRAINT assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.usage_ledger DROP CONSTRAINT usage_ledger_user_id_fkey,
  ADD CONSTRAINT usage_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.app_settings DROP CONSTRAINT app_settings_updated_by_fkey,
  ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;