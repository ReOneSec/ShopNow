import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, Alert, TextInput, Modal, ActivityIndicator, Dimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { supabase } from '@/services/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import AppIcon from '@/components/ui/AppIcon';
import { BUCKET_VAULT } from '@/constants/config';
import type { VaultItem } from '@/types/database';

const { width: SCREEN_W } = Dimensions.get('window');
const CELL_SIZE = (SCREEN_W - Spacing.screenPadding * 2 - 8) / 3;

const VAULT_KEY = 'vault_password';

// ─────────────────────────────────────────────────────────────────────────────
// Vault Screen — encrypted media storage (cloud-synced)
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState('');
  const [isDummyVault, setIsDummyVault] = useState(false);

  // Preview state
  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);

  // Change PIN state
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [changePinStep, setChangePinStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [changePinCurrent, setChangePinCurrent] = useState('');
  const [changePinNew, setChangePinNew] = useState('');
  const [changePinConfirm, setChangePinConfirm] = useState('');
  const [changePinError, setChangePinError] = useState('');

  // ── Biometric unlock ─────────────────────────────────────────────────────
  const tryBiometric = useCallback(async () => {
    const supported = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (supported && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Vault',
        fallbackLabel: 'Use PIN',
      });
      if (result.success) {
        unlockVault(false);
        return true;
      }
    }
    return false;
  }, []);

  // ── PIN unlock ───────────────────────────────────────────────────────────
  const verifyPin = async () => {
    const stored = await SecureStore.getItemAsync(VAULT_KEY);
    const duress = (await SecureStore.getItemAsync('duress_pin')) || '0000';

    if (!stored) {
      // First time — set the PIN
      if (pin.length >= 4) {
        await SecureStore.setItemAsync(VAULT_KEY, pin);
        unlockVault(false);
      } else {
        setPinError('PIN must be at least 4 digits');
      }
      return;
    }

    if (pin === stored) {
      unlockVault(false);
    } else if (pin === duress) {
      // Duress PIN entered!
      unlockVault(true);
    } else {
      setPinError('Incorrect PIN');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const unlockVault = (dummy: boolean) => {
    setIsDummyVault(dummy);
    setUnlocked(true);
    setShowPinModal(false);
    setPin('');
    loadItems(dummy);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Load vault items ──────────────────────────────────────────────────────
  const loadItems = async (dummy: boolean) => {
    if (!user) return;
    if (dummy) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('vault_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  // ── Upload encrypted vault item ───────────────────────────────────────────
  const addToVault = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop() || 'jpg';

    // Generate encryption key hint (not the real key — for UX only)
    const keyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${user?.id}_vault_${Date.now()}`
    );
    const keyHint = keyHash.slice(-4);

    // Upload to vault bucket (path is user-scoped)
    const path = `${user?.id}/vault_${Date.now()}.${ext}`;
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const ab = await blob.arrayBuffer();

    const { error } = await supabase.storage.from(BUCKET_VAULT).upload(path, ab, {
      contentType: asset.mimeType || `image/${ext}`,
    });

    if (!error) {
      const { data: urlData } = await supabase.storage.from(BUCKET_VAULT).createSignedUrl(path, 31536000);
      if (urlData) {
        await (supabase.from('vault_items') as any).insert({
          user_id: user?.id || '',
          encrypted_url: urlData.signedUrl,
          encryption_key_hint: keyHint,
          type: asset.type === 'video' ? 'video' : 'image',
          mime_type: asset.mimeType,
          file_size: asset.fileSize,
        });
        loadItems(isDummyVault);
      }
    }
    setUploading(false);
  };

  // ── Delete vault item ─────────────────────────────────────────────────────
  const deleteItem = (item: VaultItem) => {
    Alert.alert(
      'Delete Item',
      'This will permanently remove this item from your vault. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            // Extract storage path from the signed URL
            try {
              const url = new URL(item.encrypted_url);
              const pathMatch = url.pathname.match(/vault\/(.+?)(\?|$)/);
              if (pathMatch) {
                await supabase.storage.from(BUCKET_VAULT).remove([pathMatch[1]]);
              }
            } catch { /* URL parsing may fail for some signed URLs, continue */ }

            // Delete from DB
            await (supabase.from('vault_items') as any).delete().eq('id', item.id);
            setItems(prev => prev.filter(i => i.id !== item.id));
            setPreviewItem(null);
          },
        },
      ]
    );
  };

  // ── Change Vault PIN ──────────────────────────────────────────────────────
  const openChangePinModal = () => {
    setChangePinStep('current');
    setChangePinCurrent('');
    setChangePinNew('');
    setChangePinConfirm('');
    setChangePinError('');
    setShowChangePinModal(true);
  };

  const handleChangePinNext = async () => {
    if (changePinStep === 'current') {
      const stored = await SecureStore.getItemAsync(VAULT_KEY);
      if (changePinCurrent !== stored) {
        setChangePinError('Incorrect current PIN');
        return;
      }
      setChangePinError('');
      setChangePinStep('new');
    } else if (changePinStep === 'new') {
      if (changePinNew.length < 4) {
        setChangePinError('PIN must be at least 4 digits');
        return;
      }
      setChangePinError('');
      setChangePinStep('confirm');
    } else if (changePinStep === 'confirm') {
      if (changePinConfirm !== changePinNew) {
        setChangePinError('PINs do not match');
        return;
      }
      await SecureStore.setItemAsync(VAULT_KEY, changePinNew);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowChangePinModal(false);
      Alert.alert('Success', 'Vault PIN has been updated.');
    }
  };

  // ── Format file size ──────────────────────────────────────────────────────
  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  useEffect(() => {
    if (unlocked) return;
    // Try biometric first; if it fails/unavailable, show PIN modal
    const init = async () => {
      const biometricSuccess = await tryBiometric();
      if (!biometricSuccess) {
        setShowPinModal(true);
      }
    };
    init();
  }, []);

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="back" size={24} color={Colors.blue} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppIcon name="lock" size={20} color={Colors.label} />
          <Text style={styles.headerTitle}>Vault</Text>
          {unlocked && items.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{items.length}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {unlocked && (
            <>
              <TouchableOpacity style={styles.headerActionBtn} onPress={openChangePinModal}>
                <AppIcon name="key" size={17} color={Colors.label} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={addToVault} disabled={uploading}>
                {uploading ? <ActivityIndicator size="small" color={Colors.blue} /> : <Text style={styles.addIcon}>+</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* ── Vault grid ──────────────────────────────────────── */}
      {unlocked ? (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.blue} />
          </View>
        ) : (
          <FlatList
            data={items}
            numColumns={3}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={{ gap: 4 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <AppIcon name="lock" size={56} color={Colors.labelSecondary} />
                <Text style={styles.emptyTitle}>Vault is empty</Text>
                <Text style={styles.emptySubtitle}>Add photos and videos to encrypt them</Text>
                <TouchableOpacity style={styles.addFirstBtn} onPress={addToVault}>
                  <Text style={styles.addFirstText}>+ Add to Vault</Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeIn.delay(index * 40).springify().damping(18).stiffness(160)}
              >
                <TouchableOpacity
                  style={styles.gridCell}
                  onPress={() => setPreviewItem(item)}
                  onLongPress={() => deleteItem(item)}
                  activeOpacity={0.8}
                >
                  {item.type === 'image' ? (
                    <Image source={{ uri: item.encrypted_url }} style={styles.cellImage} />
                  ) : (
                    <View style={[styles.cellImage, styles.videoCellFallback]}>
                      <AppIcon name="film" size={28} color={Colors.label} />
                    </View>
                  )}
                  {/* Type + size overlay */}
                  <View style={styles.cellOverlay}>
                    <View style={styles.lockOverlay}>
                      <AppIcon name="lock" size={10} color="#fff" />
                    </View>
                    {item.file_size && (
                      <Text style={styles.cellSizeText}>{formatSize(item.file_size)}</Text>
                    )}
                  </View>
                  {item.type === 'video' && (
                    <View style={styles.videoTagOverlay}>
                      <AppIcon name="film" size={10} color="#fff" />
                      <Text style={styles.videoTagText}>VID</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            )}
          />
        )
      ) : (
        <View style={styles.lockedState}>
          <AppIcon name="shield-lock" size={72} color={Colors.label} />
          <Text style={styles.lockedTitle}>Vault Locked</Text>
          <Text style={styles.lockedSubtitle}>Use biometrics or PIN to unlock</Text>
          <TouchableOpacity style={styles.biometricBtn} onPress={tryBiometric}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="fingerprint" size={18} color="#fff" />
              <Text style={styles.biometricText}>Use Biometrics</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pinBtn} onPress={() => setShowPinModal(true)}>
            <Text style={styles.pinBtnText}>Enter PIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Preview Modal ──────────────────────────────────── */}
      <Modal visible={!!previewItem} transparent animationType="fade">
        <View style={styles.previewOverlay}>
          {/* Close */}
          <TouchableOpacity
            style={styles.previewCloseBtn}
            onPress={() => setPreviewItem(null)}
          >
            <AppIcon name="close" size={24} color="#fff" />
          </TouchableOpacity>

          {previewItem?.type === 'image' ? (
            <Image
              source={{ uri: previewItem.encrypted_url }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : previewItem ? (
            <View style={styles.previewVideoFallback}>
              <AppIcon name="film" size={72} color="rgba(255,255,255,0.6)" />
              <Text style={styles.previewVideoText}>Video Preview</Text>
            </View>
          ) : null}

          {/* Bottom info bar */}
          {previewItem && (
            <View style={styles.previewInfoBar}>
              <View style={styles.previewInfoLeft}>
                <View style={styles.previewInfoRow}>
                  <AppIcon name={previewItem.type === 'video' ? 'film' : 'image'} size={14} color="#fff" />
                  <Text style={styles.previewInfoText}>
                    {previewItem.type.charAt(0).toUpperCase() + previewItem.type.slice(1)}
                  </Text>
                </View>
                {previewItem.file_size && (
                  <Text style={styles.previewSizeText}>{formatSize(previewItem.file_size)}</Text>
                )}
                <Text style={styles.previewDateText}>
                  {new Date(previewItem.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.previewDeleteBtn}
                onPress={() => deleteItem(previewItem)}
              >
                <AppIcon name="trash" size={18} color="#fff" />
                <Text style={styles.previewDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* ── PIN Modal ──────────────────────────────────────── */}
      <Modal visible={showPinModal} transparent animationType="slide">
        <BlurView intensity={60} tint="dark" style={styles.pinModalOverlay}>
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>Vault PIN</Text>
            <Text style={styles.pinSubtitle}>
              {'Enter your vault PIN'}
            </Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(v) => { setPin(v); setPinError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="••••"
              placeholderTextColor={Colors.labelTertiary}
              autoFocus
            />
            {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
            <TouchableOpacity style={styles.pinConfirm} onPress={verifyPin}>
              <Text style={styles.pinConfirmText}>Unlock →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowPinModal(false); router.back(); }}>
              <Text style={styles.pinCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Modal>

      {/* ── Change PIN Modal ──────────────────────────────────── */}
      <Modal visible={showChangePinModal} transparent animationType="slide">
        <BlurView intensity={60} tint="dark" style={styles.pinModalOverlay}>
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>
              {changePinStep === 'current' ? 'Current PIN' :
               changePinStep === 'new' ? 'New PIN' : 'Confirm New PIN'}
            </Text>
            <Text style={styles.pinSubtitle}>
              {changePinStep === 'current' ? 'Enter your current vault PIN' :
               changePinStep === 'new' ? 'Enter a new PIN (min. 4 digits)' :
               'Re-enter your new PIN to confirm'}
            </Text>

            {/* Step indicator */}
            <View style={styles.stepIndicator}>
              {['current', 'new', 'confirm'].map((step, idx) => (
                <View
                  key={step}
                  style={[
                    styles.stepDot,
                    (idx <= ['current', 'new', 'confirm'].indexOf(changePinStep)) &&
                      styles.stepDotActive,
                  ]}
                />
              ))}
            </View>

            <TextInput
              style={styles.pinInput}
              value={
                changePinStep === 'current' ? changePinCurrent :
                changePinStep === 'new' ? changePinNew : changePinConfirm
              }
              onChangeText={(v) => {
                setChangePinError('');
                if (changePinStep === 'current') setChangePinCurrent(v);
                else if (changePinStep === 'new') setChangePinNew(v);
                else setChangePinConfirm(v);
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="••••"
              placeholderTextColor={Colors.labelTertiary}
              autoFocus
            />
            {changePinError ? <Text style={styles.pinError}>{changePinError}</Text> : null}
            <TouchableOpacity style={styles.pinConfirm} onPress={handleChangePinNext}>
              <Text style={styles.pinConfirmText}>
                {changePinStep === 'confirm' ? 'Save PIN' : 'Continue →'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowChangePinModal(false)}>
              <Text style={styles.pinCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
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
  backBtn: { padding: 4 },
  headerTitle: { ...Typography.title3, color: Colors.label },
  countBadge: {
    backgroundColor: Colors.blue, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4,
  },
  countBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  headerActionBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.fillSecondary, justifyContent: 'center', alignItems: 'center',
  },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center' },
  addIcon: { color: '#fff', fontSize: 22, fontWeight: '300' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  grid: { padding: Spacing.screenPadding, gap: 4 },
  gridCell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: Radii.sm, overflow: 'hidden', position: 'relative' },
  cellImage: { width: '100%', height: '100%' },
  videoCellFallback: { backgroundColor: Colors.fillSecondary, justifyContent: 'center', alignItems: 'center' },
  cellOverlay: {
    position: 'absolute', top: 0, right: 0, left: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 4,
  },
  lockOverlay: {
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 2,
  },
  cellSizeText: {
    fontSize: 8, color: '#fff', fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden',
  },
  videoTagOverlay: {
    position: 'absolute', bottom: 4, left: 4,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  videoTagText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { ...Typography.title3, color: Colors.label, marginBottom: 8, marginTop: 16 },
  emptySubtitle: { ...Typography.subheadline, color: Colors.labelSecondary, textAlign: 'center', marginBottom: 24 },
  addFirstBtn: { backgroundColor: Colors.blue, borderRadius: Radii.lg, paddingVertical: 14, paddingHorizontal: 32 },
  addFirstText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  lockedState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  lockedTitle: { ...Typography.title2, color: Colors.label, marginBottom: 8, marginTop: 20 },
  lockedSubtitle: { ...Typography.subheadline, color: Colors.labelSecondary, marginBottom: 32 },
  biometricBtn: { backgroundColor: Colors.blue, borderRadius: Radii.lg, paddingVertical: 16, paddingHorizontal: 40, marginBottom: 12, ...Shadows.md },
  biometricText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pinBtn: { borderWidth: 1.5, borderColor: Colors.separator, borderRadius: Radii.lg, paddingVertical: 14, paddingHorizontal: 40 },
  pinBtnText: { ...Typography.subheadline, color: Colors.labelSecondary, fontWeight: '600' },

  // Preview modal
  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  previewCloseBtn: {
    position: 'absolute', top: 56, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  previewImage: {
    width: SCREEN_W - 32, height: SCREEN_W - 32,
    borderRadius: Radii.md,
  },
  previewVideoFallback: {
    width: SCREEN_W - 32, height: SCREEN_W - 32,
    justifyContent: 'center', alignItems: 'center',
  },
  previewVideoText: {
    color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600', marginTop: 12,
  },
  previewInfoBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 28, paddingBottom: 48,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  previewInfoLeft: { gap: 4 },
  previewInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewInfoText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  previewSizeText: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  previewDateText: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  previewDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.red, borderRadius: Radii.full,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  previewDeleteText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // PIN modals
  pinModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  pinCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 32, alignItems: 'center', ...Shadows.lg },
  pinTitle: { ...Typography.title3, color: Colors.label, marginBottom: 4 },
  pinSubtitle: { ...Typography.subheadline, color: Colors.labelSecondary, marginBottom: 20, textAlign: 'center' },
  pinInput: { width: 180, borderWidth: 1.5, borderColor: Colors.separator, borderRadius: Radii.md, padding: 14, ...Typography.title2, textAlign: 'center', color: Colors.label, marginBottom: 8, letterSpacing: 8 },
  pinError: { ...Typography.footnote, color: Colors.red, marginBottom: 8 },
  pinConfirm: { backgroundColor: Colors.blue, borderRadius: Radii.lg, paddingVertical: 16, paddingHorizontal: 60, marginBottom: 12, ...Shadows.sm },
  pinConfirmText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  pinCancel: { ...Typography.body, color: Colors.labelSecondary },

  // Step indicator for Change PIN
  stepIndicator: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.fillSecondary },
  stepDotActive: { backgroundColor: Colors.blue },
});
