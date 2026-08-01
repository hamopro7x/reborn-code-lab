ALTER TABLE public.agent_devices
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agent_devices_user_id_idx ON public.agent_devices(user_id);