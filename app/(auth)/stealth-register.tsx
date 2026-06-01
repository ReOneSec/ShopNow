import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/services/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import AppIcon from '@/components/ui/AppIcon';

const OTP_LENGTH = 6;

export default function StealthRegisterScreen() {
  const router = useRouter();

  // ── Step 1: Email + Password ──────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Step 2: OTP Verification ──────────────────────────────────────────────
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // ── Resend cooldown timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // ── Step 1: Create account (Supabase sends OTP email) ─────────────────────
  const handleSignUp = async () => {
    if (!email || !password || !confirmPass) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password !== confirmPass) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);

    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Registration Failed', error.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('otp');
      setResendCooldown(60);
      // Auto-focus first OTP field after animation
      setTimeout(() => otpRefs.current[0]?.focus(), 500);
    }
  };

  // ── Step 2: Verify OTP ─────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== OTP_LENGTH) {
      Alert.alert('Error', 'Please enter the complete 6-digit code');
      return;
    }

    setVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otpCode,
      type: 'email',
    });
    setVerifying(false);

    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Verification Failed', error.message);
      // Clear OTP inputs
      setOtp(Array(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Load user profile if exists
      if (data?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single();
        if (profile) {
          useAuthStore.getState().setUser(profile);
        }
      }
      router.replace('/(onboarding)/welcome');
    }
  };

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setResendCooldown(60);
      Alert.alert('Code Sent', 'A new verification code has been sent to your email.');
    }
  };

  // ── OTP Input Handlers ────────────────────────────────────────────────────
  const handleOtpChange = (text: string, index: number) => {
    // Only allow digits
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto-advance to next field
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (digit && index === OTP_LENGTH - 1) {
      const fullCode = newOtp.join('');
      if (fullCode.length === OTP_LENGTH) {
        // Small delay so user sees the last digit fill in
        setTimeout(() => handleVerifyOtp(), 300);
      }
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  };

  // ── Paste handler for OTP ─────────────────────────────────────────────────
  const handleOtpPaste = (text: string, index: number) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    if (digits.length > 1) {
      const newOtp = [...otp];
      for (let i = 0; i < digits.length && i + index < OTP_LENGTH; i++) {
        newOtp[i + index] = digits[i];
      }
      setOtp(newOtp);
      const nextIdx = Math.min(index + digits.length, OTP_LENGTH - 1);
      otpRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
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
            <AppIcon name="shield-lock" size={36} color="#fff" />
          </View>
          <Text style={styles.appName}>StealthChat</Text>
          <Text style={styles.tagline}>
            {step === 'credentials' ? 'Join the private network' : 'Verify your identity'}
          </Text>
        </View>

        {/* ── Step 1: Credentials ────────────────────────────────────── */}
        {step === 'credentials' && (
          <Animated.View entering={FadeIn.duration(300)}>
            <BlurView intensity={80} tint="light" style={styles.card}>
              <Text style={styles.cardTitle}>Create Account</Text>
              <Text style={styles.cardSubtitle}>Set up your secure credentials</Text>

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
                    placeholder="Min. 8 characters"
                    placeholderTextColor={Colors.labelTertiary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.showBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.showBtnText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.inputRow}>
                  <View style={{ width: 24 }}>
                    <AppIcon name="lock" size={16} color={Colors.label} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.labelTertiary}
                    value={confirmPass}
                    onChangeText={setConfirmPass}
                    secureTextEntry={!showConfirmPass}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPass(!showConfirmPass)}
                    style={styles.showBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.showBtnText}>{showConfirmPass ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleSignUp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Continue →</Text>
                )}
              </TouchableOpacity>

              <View style={styles.loginRow}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.replace('/(auth)/stealth-login')}>
                  <Text style={styles.loginLink}>Sign in</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </Animated.View>
        )}

        {/* ── Step 2: OTP Verification ──────────────────────────────── */}
        {step === 'otp' && (
          <Animated.View entering={FadeIn.duration(300)}>
            <BlurView intensity={80} tint="light" style={styles.card}>
              <View style={styles.otpHeaderRow}>
                <TouchableOpacity
                  onPress={() => setStep('credentials')}
                  style={styles.backBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <AppIcon name="chevron-left" size={18} color={Colors.label} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Verify Email</Text>
                  <Text style={styles.cardSubtitle}>
                    Enter the 6-digit code sent to
                  </Text>
                  <Text style={styles.emailHighlight}>{email}</Text>
                </View>
              </View>

              {/* OTP Input Fields */}
              <View style={styles.otpContainer}>
                {otp.map((digit, index) => (
                  <Animated.View
                    key={index}
                    entering={FadeInDown.delay(index * 60).springify().damping(18)}
                  >
                    <TextInput
                      ref={(ref) => { otpRefs.current[index] = ref; }}
                      style={[
                        styles.otpInput,
                        digit ? styles.otpInputFilled : null,
                      ]}
                      value={digit}
                      onChangeText={(text) => {
                        // Check for paste (multi-char input)
                        if (text.length > 1) {
                          handleOtpPaste(text, index);
                        } else {
                          handleOtpChange(text, index);
                        }
                      }}
                      onKeyPress={(e) => handleOtpKeyPress(e, index)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      textContentType="oneTimeCode"
                    />
                  </Animated.View>
                ))}
              </View>

              {/* Verify Button */}
              <TouchableOpacity
                style={[styles.btn, verifying && styles.btnDisabled]}
                onPress={handleVerifyOtp}
                disabled={verifying}
                activeOpacity={0.85}
              >
                {verifying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Verify & Create Account</Text>
                )}
              </TouchableOpacity>

              {/* Resend */}
              <View style={styles.resendRow}>
                <Text style={styles.resendText}>Didn't receive the code? </Text>
                {resendCooldown > 0 ? (
                  <Text style={styles.resendCooldown}>Resend in {resendCooldown}s</Text>
                ) : (
                  <TouchableOpacity onPress={handleResendOtp} disabled={loading}>
                    <Text style={styles.resendLink}>Resend Code</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Security note */}
              <View style={styles.securityNote}>
                <AppIcon name="shield-lock" size={14} color={Colors.labelTertiary} />
                <Text style={styles.securityNoteText}>
                  Your verification code expires in 60 minutes
                </Text>
              </View>
            </BlurView>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A2E' },
  bg: { ...StyleSheet.absoluteFill as any },
  bgBlob1: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(175,82,222,0.3)', top: -80, right: -80,
  },
  bgBlob2: {
    position: 'absolute', width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(0,122,255,0.25)', bottom: 100, left: -60,
  },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.screenPadding },

  logoSection: { alignItems: 'center', marginBottom: 16 },
  logoIcon: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.purple,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8, ...Shadows.md,
  },
  appName: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  card: {
    borderRadius: Radii.sheet, padding: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', ...Shadows.lg,
  },
  cardTitle: { ...Typography.title3, color: Colors.label, marginBottom: 2 },
  cardSubtitle: { ...Typography.subheadline, color: Colors.labelSecondary, marginBottom: 2 },
  emailHighlight: {
    ...Typography.subheadline, color: Colors.purple,
    fontWeight: '700', marginBottom: 12,
  },

  inputWrapper: { marginBottom: 10 },
  inputLabel: { ...Typography.footnote, fontWeight: '600', color: Colors.labelSecondary, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.fillTertiary, borderRadius: Radii.md,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  input: { flex: 1, ...Typography.body, color: Colors.label },
  showBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  showBtnText: { ...Typography.footnote, color: Colors.blue, fontWeight: '600' },

  btn: {
    backgroundColor: Colors.purple, borderRadius: Radii.lg,
    paddingVertical: 12, alignItems: 'center', marginTop: 4, ...Shadows.md,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  loginText: { ...Typography.subheadline, color: Colors.labelSecondary },
  loginLink: { ...Typography.subheadline, color: Colors.blue, fontWeight: '600' },

  // OTP Step
  otpHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  backBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.fillTertiary,
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  otpContainer: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 8, marginVertical: 14,
  },
  otpInput: {
    width: 40, height: 48, borderRadius: Radii.md,
    backgroundColor: Colors.fillTertiary,
    textAlign: 'center', fontSize: 20, fontWeight: '700',
    color: Colors.label,
    borderWidth: 2, borderColor: 'transparent',
  },
  otpInputFilled: {
    borderColor: Colors.purple,
    backgroundColor: 'rgba(175,82,222,0.08)',
  },

  resendRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 12,
  },
  resendText: { ...Typography.footnote, color: Colors.labelSecondary },
  resendCooldown: { ...Typography.footnote, color: Colors.labelTertiary, fontWeight: '600' },
  resendLink: { ...Typography.footnote, color: Colors.purple, fontWeight: '700' },

  securityNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.separator,
  },
  securityNoteText: { ...Typography.caption1, color: Colors.labelTertiary },
});
