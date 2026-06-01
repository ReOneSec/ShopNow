import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { supabase } from '@/services/supabase/client';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';

const isExpoGo = Constants.appOwnership === 'expo';

// Only import and configure expo-notifications outside of Expo Go
let Notifications: typeof import('expo-notifications') | null = null;
if (!isExpoGo) {
  Notifications = require('expo-notifications') as typeof import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowList: true,
    }),
  });
}

export default function PermissionsScreen() {
  const router = useRouter();
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestNotifications = async () => {
    // In Expo Go, skip native notification APIs and simulate granting
    if (isExpoGo || !Notifications) {
      console.warn('Push notifications are not supported in Expo Go. Skipping.');
      setGranted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B35',
      });
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      setGranted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Get Expo push token and save to DB
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const token = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        const { data: { user } } = await supabase.auth.getUser();
        if (user && token.data) {
          await (supabase.from('users') as any).update({ push_token: token.data }).eq('id', user.id);
        }
      } catch (e) {
        console.warn('Push token error:', e);
      }
    } else {
      Alert.alert('Notifications disabled', 'You can enable them in Settings later.');
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(app)/chats');
  };

  return (
    <View style={styles.container}>
      <View style={styles.bg}>
        <View style={styles.blob} />
      </View>

      <View style={styles.content}>
        <View style={styles.progressRow}>
          {[1, 2, 3].map((step) => (
            <View key={step} style={[styles.progressDot, styles.progressDotActive]} />
          ))}
        </View>

        <View style={styles.iconWrap}>
          <Text style={styles.icon}>🔔</Text>
        </View>
        <Text style={styles.title}>Stay notified{'\n'}(disguised)</Text>
        <Text style={styles.subtitle}>
          All notifications appear as shopping updates.{'\n'}
          No real message content ever shows.
        </Text>

        <View style={styles.exampleCard}>
          <Text style={styles.exampleLabel}>Example notification:</Text>
          <View style={styles.notifMock}>
            <Text style={styles.notifTitle}>ShopNow 🔥</Text>
            <Text style={styles.notifBody}>Flash Sale: 80% off! Limited time.</Text>
          </View>
        </View>

        {!granted ? (
          <TouchableOpacity style={styles.btn} onPress={requestNotifications}>
            <Text style={styles.btnText}>Enable Notifications</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.grantedRow}>
            <Text style={styles.grantedText}>✅ Notifications enabled</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btnOutline, loading && { opacity: 0.6 }]}
          onPress={handleFinish}
          disabled={loading}
        >
          <Text style={styles.btnOutlineText}>
            {granted ? 'Enter the App →' : 'Skip for now'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08071A' },
  bg: { ...StyleSheet.absoluteFill },
  blob: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(255,149,0,0.12)', top: 60, right: -60,
  },
  content: { flex: 1, padding: Spacing.screenPadding, paddingTop: 80, alignItems: 'center' },
  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 40, alignSelf: 'flex-start' },
  progressDot: { width: 32, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  progressDotActive: { backgroundColor: Colors.blue, width: 64 },
  iconWrap: {
    width: 100, height: 100, borderRadius: 32, backgroundColor: 'rgba(255,149,0,0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24, ...Shadows.lg,
  },
  icon: { fontSize: 48 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 12, lineHeight: 40, textAlign: 'center' },
  subtitle: { ...Typography.subheadline, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  exampleCard: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radii.card,
    padding: 16, width: '100%', marginBottom: 32,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  exampleLabel: { ...Typography.caption1, color: 'rgba(255,255,255,0.4)', marginBottom: 10 },
  notifMock: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radii.md, padding: 12 },
  notifTitle: { fontWeight: '700', color: '#fff', marginBottom: 4 },
  notifBody: { ...Typography.footnote, color: 'rgba(255,255,255,0.7)' },
  btn: {
    backgroundColor: Colors.orange, borderRadius: Radii.lg,
    paddingVertical: 16, paddingHorizontal: 40, marginBottom: 12, ...Shadows.md,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  grantedRow: { marginBottom: 12 },
  grantedText: { color: Colors.green, fontSize: 16, fontWeight: '600' },
  btnOutline: {
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: Radii.lg, paddingVertical: 14, paddingHorizontal: 40,
  },
  btnOutlineText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '600' },
});
