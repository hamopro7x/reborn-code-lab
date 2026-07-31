DROP FUNCTION IF EXISTS public.admin_exists();

-- Explicitly ensure no client-side (anon/authenticated) write path exists for orders,
-- order items, or payment screenshots: all writes go through server-side functions.
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;