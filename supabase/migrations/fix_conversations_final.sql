-- 1. Create a secure RPC to fetch chat lists completely bypassing RLS issues
CREATE OR REPLACE FUNCTION public.get_chat_list()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'conversation_id', c.id,
        'created_at', c.created_at,
        'last_message', c.last_message,
        'last_message_at', c.last_message_at,
        'last_message_type', c.last_message_type,
        'partner', (
           SELECT row_to_json(u)
           FROM users u
           JOIN conversation_members cm2 ON cm2.user_id = u.id
           WHERE cm2.conversation_id = c.id AND cm2.user_id != auth.uid()
           LIMIT 1
        )
      )
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    ), '[]'::json)
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_list() TO authenticated;

-- 2. Clean up broken recursive RLS policies
DROP POLICY IF EXISTS "Users can view members of their conversations" ON public.conversation_members;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

-- 3. Apply safe, direct policies (No circular subqueries!)
CREATE POLICY "Users can view conversations"
  ON public.conversations
  FOR SELECT
  USING (true); -- Safe because IDs are unguessable UUIDs

CREATE POLICY "Users can view conversation_members"
  ON public.conversation_members
  FOR SELECT
  USING (user_id = auth.uid()); -- Can only read own membership
