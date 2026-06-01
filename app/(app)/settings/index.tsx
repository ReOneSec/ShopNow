import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  Switch, ScrollView, BackHandler, Modal, TextInput,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/services/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import AppIcon from '@/components/ui/AppIcon';

// ─────────────────────────────────────────────────────────────────────────────
// Settings Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const router = useRouter();
  const { user, setUser, signOut, panicWipe } = useAuthStore();
  const { setConversations } = useChatStore();

  // Settings state — persisted to Supabase
  const [notifDisguise, setNotifDisguise] = useState(true);
  const [panicEnabled, setPanicEnabled] = useState(true);
  const [biometricVault, setBiometricVault] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Duress PIN modal state
  const [showDuressModal, setShowDuressModal] = useState(false);
  const [duressPin, setDuressPin] = useState('');
  const [duressPinInput, setDuressPinInput] = useState('');
  const [duressPinError, setDuressPinError] = useState('');

  // Change Alias modal state
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasSaving, setAliasSaving] = useState(false);

  // ── Load settings from Supabase on mount ──────────────────────────────────
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;

      // Load duress PIN from SecureStore
      const storedDuress = await SecureStore.getItemAsync('duress_pin');
      setDuressPin(storedDuress || '0000');

      // Load settings from Supabase
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setNotifDisguise(data.notification_disguise ?? true);
        setPanicEnabled(data.panic_enabled ?? true);
        setBiometricVault(data.biometric_vault ?? false);
      } else {
        // Create default settings row
        await (supabase.from('settings') as any).insert({
          user_id: user.id,
          notification_disguise: true,
          panic_enabled: true,
          biometric_vault: false,
        });
      }
      setSettingsLoaded(true);
    };
    loadSettings();
  }, [user]);

  // ── Persist a setting to Supabase ─────────────────────────────────────────
  const updateSetting = async (key: string, value: boolean) => {
    if (!user || !settingsLoaded) return;
    await (supabase.from('settings') as any)
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  };

  const handleNotifDisguiseToggle = (val: boolean) => {
    setNotifDisguise(val);
    updateSetting('notification_disguise', val);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePanicToggle = (val: boolean) => {
    setPanicEnabled(val);
    updateSetting('panic_enabled', val);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleBiometricToggle = (val: boolean) => {
    setBiometricVault(val);
    updateSetting('biometric_vault', val);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Duress PIN (cross-platform modal) ─────────────────────────────────────
  const openDuressModal = () => {
    setDuressPinInput(duressPin === '0000' ? '' : duressPin);
    setDuressPinError('');
    setShowDuressModal(true);
  };

  const saveDuressPin = async () => {
    if (duressPinInput.length < 4) {
      setDuressPinError('PIN must be at least 4 digits');
      return;
    }
    // Validate it's not the same as vault PIN
    const vaultPin = await SecureStore.getItemAsync('vault_password');
    if (duressPinInput === vaultPin) {
      setDuressPinError('Duress PIN cannot be the same as vault PIN');
      return;
    }
    await SecureStore.setItemAsync('duress_pin', duressPinInput);
    setDuressPin(duressPinInput);
    setShowDuressModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', 'Duress PIN has been updated.');
  };

  // ── Change Alias ──────────────────────────────────────────────────────────
  const openAliasModal = () => {
    setAliasInput(user?.alias || '');
    setShowAliasModal(true);
  };

  const saveAlias = async () => {
    if (!user || !aliasInput.trim()) return;
    setAliasSaving(true);
    const { error } = await supabase
      .from('users')
      .update({ alias: aliasInput.trim() })
      .eq('id', user.id);

    if (!error) {
      setUser({ ...user, alias: aliasInput.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAliasModal(false);
    } else {
      Alert.alert('Error', 'Failed to update alias. Try again.');
    }
    setAliasSaving(false);
  };

  // ── App Disguise Info ─────────────────────────────────────────────────────
  const showDisguiseInfo = () => {
    Alert.alert(
      'App Disguise',
      'StealthChat disguises itself as "ShopNow", a shopping app. The icon, name, and home screen all appear as a normal e-commerce app.\n\nThis cannot be changed to maintain consistency of the disguise.',
      [{ text: 'Got it' }]
    );
  };

  // ── Clear All Chats ───────────────────────────────────────────────────────
  const handleClearChats = () => {
    Alert.alert(
      'Clear All Chats',
      'This will delete all your conversation history locally. Messages will still exist on the server for other participants.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            setConversations([]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Done', 'All local chat data cleared.');
          },
        },
      ]
    );
  };

  // ── Sign Out ──────────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Sign out of StealthChat?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(disguise)');
        },
      },
    ]);
  };

  // ── Panic Wipe ────────────────────────────────────────────────────────────
  const handleFullPanic = () => {
    Alert.alert(
      '🚨 PANIC DELETE',
      'This will:\n\n• Delete all local data\n• Sign you out immediately\n• Close the app\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'WIPE EVERYTHING',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            // Clear stores
            setConversations([]);
            // Wipe all SecureStore keys
            await panicWipe();
            // Force close app
            setTimeout(() => BackHandler.exitApp(), 500);
          },
        },
      ]
    );
  };

  // ── Delete Account ────────────────────────────────────────────────────────
  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Delete Account',
      'This will permanently delete your account and all associated data including:\n\n• Your profile\n• All conversations\n• Vault items\n• Friend connections\n\nThis action is irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            // Delete user data from tables
            await (supabase.from('vault_items') as any).delete().eq('user_id', user.id);
            await (supabase.from('conversation_members') as any).delete().eq('user_id', user.id);
            await (supabase.from('friend_requests') as any).delete()
              .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
            await (supabase.from('friendships') as any).delete()
              .or(`user_one.eq.${user.id},user_two.eq.${user.id}`);
            await (supabase.from('settings') as any).delete().eq('user_id', user.id);
            await supabase.from('users').delete().eq('id', user.id);

            // Sign out and wipe
            setConversations([]);
            await panicWipe();
            setTimeout(() => BackHandler.exitApp(), 500);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AppIcon name="back" size={24} color={Colors.blue} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <Animated.View entering={FadeInUp.delay(60).springify().damping(20).stiffness(160)}>
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitial}>{user?.alias?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View>
              <Text style={styles.profileAlias}>{user?.alias}</Text>
              <Text style={styles.profileUsername}>@{user?.username}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Security */}
        <Animated.View entering={FadeInUp.delay(140).springify().damping(20).stiffness(160)}>
          <Text style={styles.sectionLabel}>SECURITY</Text>
          <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="bell" size={20} color={Colors.label} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Disguised Notifications</Text>
                <Text style={styles.settingDesc}>Show fake shopping notifications</Text>
              </View>
            </View>
            <Switch
              value={notifDisguise}
              onValueChange={handleNotifDisguiseToggle}
              trackColor={{ true: Colors.blue }}
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="alarm" size={20} color={Colors.red} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Panic Delete</Text>
                <Text style={styles.settingDesc}>Allow long-press panic button</Text>
              </View>
            </View>
            <Switch
              value={panicEnabled}
              onValueChange={handlePanicToggle}
              trackColor={{ true: Colors.red }}
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="fingerprint" size={20} color={Colors.label} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Biometric Vault</Text>
                <Text style={styles.settingDesc}>Unlock vault with fingerprint/face</Text>
              </View>
            </View>
            <Switch
              value={biometricVault}
              onValueChange={handleBiometricToggle}
              trackColor={{ true: Colors.blue }}
            />
          </View>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={openDuressModal}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="shield-lock" size={20} color={Colors.label} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Duress PIN</Text>
                <Text style={styles.settingDesc}>
                  {duressPin && duressPin !== '0000' ? 'Configured (Tap to change)' : 'Not configured (Default: 0000)'}
                </Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/(app)/vault')}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="key" size={20} color={Colors.label} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Change Vault PIN</Text>
                <Text style={styles.settingDesc}>Update your vault access code</Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Disguise Info */}
        <Animated.View entering={FadeInUp.delay(220).springify().damping(20).stiffness(160)}>
          <Text style={styles.sectionLabel}>DISGUISE</Text>
          <View style={styles.section}>
          <TouchableOpacity style={styles.settingRow} onPress={showDisguiseInfo}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="cart" size={20} color={Colors.label} />
              </View>
              <View>
                <Text style={styles.settingTitle}>App Disguise Name</Text>
                <Text style={styles.settingDesc}>Appears as "ShopNow" publicly</Text>
              </View>
            </View>
            <AppIcon name="help" size={16} color={Colors.labelTertiary} />
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={openAliasModal}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="mask" size={20} color={Colors.label} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Change Alias</Text>
                <Text style={styles.settingDesc}>{user?.alias}</Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Danger Zone */}
        <Animated.View entering={FadeInUp.delay(300).springify().damping(20).stiffness(160)}>
          <Text style={styles.sectionLabel}>DANGER ZONE</Text>
          <View style={styles.section}>
          <TouchableOpacity style={styles.settingRow} onPress={handleClearChats}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="trash" size={20} color={Colors.orange} />
              </View>
              <View>
                <Text style={[styles.settingTitle, { color: Colors.orange }]}>Clear All Chats</Text>
                <Text style={styles.settingDesc}>Remove all local conversations</Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={handleSignOut}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="door" size={20} color={Colors.orange} />
              </View>
              <Text style={[styles.settingTitle, { color: Colors.orange }]}>Sign Out</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.settingRow, styles.panicRow]}
            onPress={handleFullPanic}
          >
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="explosion" size={20} color={Colors.red} />
              </View>
              <View>
                <Text style={[styles.settingTitle, { color: Colors.red }]}>Panic Wipe</Text>
                <Text style={styles.settingDesc}>Erase everything and close app</Text>
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.settingRow, styles.deleteAccountRow]}
            onPress={handleDeleteAccount}
          >
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrap}>
                <AppIcon name="warning" size={20} color={Colors.red} />
              </View>
              <View>
                <Text style={[styles.settingTitle, { color: Colors.red }]}>Delete Account</Text>
                <Text style={styles.settingDesc}>Permanently remove all data</Text>
              </View>
            </View>
          </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Version */}
        <Text style={styles.versionText}>StealthChat v1.0.0 • Disguised as ShopNow</Text>
      </ScrollView>

      {/* ── Duress PIN Modal ──────────────────────────────── */}
      <Modal visible={showDuressModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set Duress PIN</Text>
            <Text style={styles.modalSubtitle}>
              Enter a 4-digit PIN for the dummy vault. When entered instead of the real PIN, an empty vault will be shown.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={duressPinInput}
              onChangeText={(v) => { setDuressPinInput(v.replace(/[^0-9]/g, '')); setDuressPinError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="••••"
              placeholderTextColor={Colors.labelTertiary}
              autoFocus
            />
            {duressPinError ? <Text style={styles.modalError}>{duressPinError}</Text> : null}
            <TouchableOpacity style={styles.modalSaveBtn} onPress={saveDuressPin}>
              <Text style={styles.modalSaveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDuressModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Change Alias Modal ────────────────────────────── */}
      <Modal visible={showAliasModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Alias</Text>
            <Text style={styles.modalSubtitle}>
              Your alias is what other users see. Choose something memorable.
            </Text>
            <TextInput
              style={[styles.modalInput, { letterSpacing: 0 }]}
              value={aliasInput}
              onChangeText={setAliasInput}
              placeholder="Your alias..."
              placeholderTextColor={Colors.labelTertiary}
              autoFocus
              maxLength={30}
              autoCapitalize="words"
            />
            <TouchableOpacity
              style={[styles.modalSaveBtn, aliasSaving && { opacity: 0.6 }]}
              onPress={saveAlias}
              disabled={aliasSaving || !aliasInput.trim()}
            >
              <Text style={styles.modalSaveBtnText}>{aliasSaving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAliasModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: Spacing.screenPadding, paddingBottom: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 0.5, borderBottomColor: Colors.separator,
  },
  title: { ...Typography.title3, color: Colors.label },
  scroll: { padding: Spacing.screenPadding, paddingBottom: 60 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: Colors.surface, borderRadius: Radii.card,
    padding: 20, marginBottom: 24, ...Shadows.sm,
  },
  profileAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center',
  },
  profileInitial: { color: '#fff', fontSize: 28, fontWeight: '700' },
  profileAlias: { ...Typography.title3, color: Colors.label },
  profileUsername: { ...Typography.subheadline, color: Colors.labelSecondary },

  sectionLabel: {
    ...Typography.caption1, fontWeight: '700', color: Colors.labelSecondary,
    marginBottom: 8, marginLeft: 4,
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: Colors.surface, borderRadius: Radii.card,
    marginBottom: 24, overflow: 'hidden', ...Shadows.sm,
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  settingInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIconWrap: { width: 28, alignItems: 'center' },
  settingTitle: { ...Typography.subheadline, color: Colors.label, fontWeight: '600' },
  settingDesc: { ...Typography.caption1, color: Colors.labelSecondary, marginTop: 2 },
  divider: { height: 0.5, backgroundColor: Colors.separator, marginLeft: 56 },
  chevron: { fontSize: 20, color: Colors.labelTertiary },
  panicRow: { backgroundColor: 'rgba(255,59,48,0.04)' },
  deleteAccountRow: { backgroundColor: 'rgba(255,59,48,0.04)' },

  versionText: {
    ...Typography.caption2, color: Colors.labelQuaternary,
    textAlign: 'center', marginTop: 8,
  },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 32, alignItems: 'center', ...Shadows.lg,
  },
  modalTitle: { ...Typography.title3, color: Colors.label, marginBottom: 4 },
  modalSubtitle: {
    ...Typography.subheadline, color: Colors.labelSecondary,
    marginBottom: 20, textAlign: 'center',
    lineHeight: 20,
  },
  modalInput: {
    width: '100%', borderWidth: 1.5, borderColor: Colors.separator, borderRadius: Radii.md,
    padding: 14, ...Typography.title2, textAlign: 'center', color: Colors.label,
    marginBottom: 8, letterSpacing: 8,
  },
  modalError: { ...Typography.footnote, color: Colors.red, marginBottom: 8 },
  modalSaveBtn: {
    backgroundColor: Colors.blue, borderRadius: Radii.lg,
    paddingVertical: 16, paddingHorizontal: 60, marginBottom: 12,
    ...Shadows.sm, width: '100%', alignItems: 'center',
  },
  modalSaveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  modalCancelText: { ...Typography.body, color: Colors.labelSecondary },
});
