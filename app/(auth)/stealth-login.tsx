import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/services/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import AppIcon from '@/components/ui/AppIcon';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Login Failed', error.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Check if profile exists and load it into the store
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();
        if (profile) {
          useAuthStore.getState().setUser(profile);
          router.replace('/(app)/chats');
        } else {
          router.replace('/(onboarding)/welcome');
        }
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Gradient Background */}
      <View style={styles.bg}>
        <View style={styles.bgBlob1} />
        <View style={styles.bgBlob2} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoIcon}>
            <AppIcon name="chat" size={36} color="#fff" />
          </View>
          <Text style={styles.appName}>StealthChat</Text>
          <Text style={styles.tagline}>Private. Secure. Always.</Text>
        </View>

        {/* Card */}
        <BlurView intensity={80} tint="light" style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSubtitle}>Sign in to continue</Text>

          {/* Email */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputRow}>
              <View style={{ width: 24 }}>
                <AppIcon name="mail" size={16} color={Colors.label} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor={Colors.labelTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputRow}>
              <View style={{ width: 24 }}>
                <AppIcon name="lock" size={16} color={Colors.label} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={Colors.labelTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <Text style={styles.showPassText}>{showPass ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Sign In →</Text>
            )}
          </TouchableOpacity>

          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/stealth-register')}>
              <Text style={styles.registerLink}>Create Account</Text>
            </TouchableOpacity>
          </View>

        </BlurView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A2E' },
  bg: { ...StyleSheet.absoluteFill },
  bgBlob1: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(0,122,255,0.3)', top: -80, left: -80,
  },
  bgBlob2: {
    position: 'absolute', width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(175,82,222,0.25)', bottom: 100, right: -60,
  },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.screenPadding },

  logoSection: { alignItems: 'center', marginBottom: 16 },
  logoIcon: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center',
    marginBottom: 8, ...Shadows.md,
  },
  logoEmoji: { fontSize: 28 },
  appName: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  card: {
    borderRadius: Radii.sheet, padding: 20,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    ...Shadows.lg,
  },
  cardTitle: { ...Typography.title3, color: Colors.label, marginBottom: 2 },
  cardSubtitle: { ...Typography.subheadline, color: Colors.labelSecondary, marginBottom: 16 },

  inputWrapper: { marginBottom: 12 },
  inputLabel: { ...Typography.footnote, fontWeight: '600', color: Colors.labelSecondary, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.fillTertiary, borderRadius: Radii.md,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  input: { flex: 1, ...Typography.body, color: Colors.label },
  showPassText: { ...Typography.footnote, color: Colors.blue, fontWeight: '600' },

  loginBtn: {
    backgroundColor: Colors.blue, borderRadius: Radii.lg,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
    ...Shadows.md,
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  registerText: { ...Typography.subheadline, color: Colors.labelSecondary },
  registerLink: { ...Typography.subheadline, color: Colors.blue, fontWeight: '600' },
});
