-- Orders are created and deleted only by authenticated server functions using service_role.
-- Browser sessions may only perform the status transition exposed by the admin order UI.
BEGIN;

REVOKE INSERT, DELETE, UPDATE ON TABLE public.orders FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status, confirmed_at) ON TABLE public.orders TO authenticated;

-- Order items are created/deleted by server-side checkout/admin functions only.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.order_items FROM PUBLIC, anon, authenticated;

COMMIT;
