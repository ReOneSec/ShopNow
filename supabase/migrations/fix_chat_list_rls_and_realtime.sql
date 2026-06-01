-- Fix infinite recursion in conversation_members
DROP POLICY IF EXISTS "Users can view members of their conversations" ON public.conversation_members;

-- Helper function to get user's conversation IDs without triggering policies
CREATE OR REPLACE FUNCTION get_my_conversations()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid();
$$;

-- Apply the new policy that uses the helper function to avoid recursion
CREATE POLICY "Users can view members of their conversations"
  ON public.conversation_members
  FOR SELECT
  USING (
    conversation_id IN (SELECT get_my_conversations())
  );

-- Enable realtime for the necessary tables so the app updates instantly
BEGIN;
  -- Remove tables if they are already in the publication to avoid errors, then add them back
  -- We'll just do it safely with PL/pgSQL
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversations') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_members') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'friend_requests') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'friendships') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
    END IF;
  END
  $$;
COMMIT;
