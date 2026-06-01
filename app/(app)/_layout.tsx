import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/services/supabase/client';
import SensorLock from '@/components/disguise/SensorLock';

export default function AppLayout() {
  const router = useRouter();
  const { isAuthenticated, isUnlocked, isLoading, setUser } = useAuthStore();

  useEffect(() => {
    // Wait for auth to finish loading before making routing decisions
    if (isLoading) return;

    if (!isUnlocked || !isAuthenticated) {
      router.replace('/(disguise)');
      return;
    }

    // Load user profile
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users').select('*').eq('id', user.id).single();
        if (profile) setUser(profile);
      }
    };
    loadUser();

    // Update presence
    (supabase.rpc as any)('update_presence', { is_online_status: true });
    return () => {
      (supabase.rpc as any)('update_presence', { is_online_status: false });
    };
  }, [isAuthenticated, isUnlocked, isLoading]);

  return (
    <>
      <SensorLock />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="chats/index" />
        <Stack.Screen name="chats/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="vault/index" />
        <Stack.Screen name="settings/index" />
      </Stack>
    </>
  );
}
