-- Upgrade existing deployments without changing backend service-role access.
BEGIN;
DROP POLICY IF EXISTS service_role_all ON public.users;
CREATE POLICY service_role_all ON public.users
    TO service_role USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
    FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
COMMIT;
