import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Image, KeyboardAvoidingView, Platform,
  Alert, Modal, Dimensions, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { supabase } from '@/services/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { BUCKET_MEDIA } from '@/constants/config';
import AnimatedBubble from '@/components/ui/AnimatedBubble';
import AppIcon from '@/components/ui/AppIcon';
import type { Message, AppUser } from '@/types/database';

const { width: SCREEN_W } = Dimensions.get('window');
const MAX_BUBBLE_W = SCREEN_W * 0.72;

// ─────────────────────────────────────────────────────────────────────────────
// Chat Screen — real-time iMessage-style messaging
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { conversations, messages, setMessages, appendMessage, removeConversation, removeMessages } = useChatStore();

  const [text, setText] = useState('');
  const [partner, setPartner] = useState<AppUser | null>(null);
  const [sending, setSending] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showPanicConfirm, setShowPanicConfirm] = useState(false);
  const [showProfilePic, setShowProfilePic] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [typingVisible, setTypingVisible] = useState(false);
  const [isEphemeral, setIsEphemeral] = useState(false);

  const flatRef = useRef<FlatList>(null);
  const convMessages = messages[conversationId] || [];

  // Animated send button
  const sendScale = useSharedValue(1);
  const sendAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  // ── Load partner + messages ──────────────────────────────────────────────
  useEffect(() => {
    if (!user || !conversationId) return;

    // Get partner
    // Load partner from local store to avoid RLS restrictions on conversation_members
    const loadPartner = () => {
      const conv = conversations.find(c => c.id === conversationId);
      if (conv?.partner) {
        setPartner(conv.partner);
      }
    };

    // Load messages (get latest 200 messages)
    const loadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(200);
        
      if (data) {
        // Reverse so the oldest of the latest 200 is at the top of the chat
        setMessages(conversationId, data.reverse());
      }
    };

    loadPartner();
    loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`chat_${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id !== user.id) {
          appendMessage(conversationId, msg);
          flatRef.current?.scrollToEnd({ animated: true });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user]);

  // ── Scroll on new messages ───────────────────────────────────────────────
  useEffect(() => {
    if (convMessages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [convMessages.length]);

  // ── Send text message ────────────────────────────────────────────────────
  const sendMessage = async (content: string, type: Message['message_type'] = 'text', mediaUrl?: string) => {
    if (!user || !conversationId) return;
    if (type === 'text' && !content.trim()) return;

    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const finalContent = (isEphemeral && type === 'text') ? `[EPH]${content}` : content;

    const optimisticMsg: Message = {
      id: `temp_${Date.now()}`,
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: type,
      content: finalContent || null,
      media_url: mediaUrl || null,
      is_deleted: false,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    appendMessage(conversationId, optimisticMsg);
    setText('');

    const { data, error } = await (supabase.from('messages') as any).insert({
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: type,
      content: finalContent || null,
      media_url: mediaUrl || null,
    }).select().single();

    if (!error && data) {
      // Update conversation last message
      await (supabase.from('conversations') as any).update({
        last_message: type === 'text' ? content : `Attachment: ${type}`,
        last_message_at: (data as any).created_at,
        last_message_type: type,
      }).eq('id', conversationId);
    }
    setSending(false);
    flatRef.current?.scrollToEnd({ animated: true });
  };

  // ── Upload media ─────────────────────────────────────────────────────────
  const pickAndSendMedia = async () => {
    setShowAttach(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop() || 'jpg';
    const path = `${user?.id}/${Date.now()}.${ext}`;

    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const ab = await blob.arrayBuffer();

    const { error } = await supabase.storage.from(BUCKET_MEDIA).upload(path, ab, {
      contentType: asset.mimeType || `image/${ext}`,
    });

    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(path);
      const isVideo = asset.type === 'video' || asset.mimeType?.startsWith('video/');
      await sendMessage('', isVideo ? 'video' : 'image', publicUrl);
    }
  };

  // ── Document picker ──────────────────────────────────────────────────────
  const pickAndSendDocument = async () => {
    setShowAttach(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const ext = asset.name.split('.').pop() || 'file';
    const path = `${user?.id}/doc_${Date.now()}.${ext}`;

    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const ab = await blob.arrayBuffer();

    const { error } = await supabase.storage.from(BUCKET_MEDIA).upload(path, ab, {
      contentType: asset.mimeType || 'application/octet-stream',
    });

    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(path);
      await sendMessage(asset.name, 'document', publicUrl);
    }
  };

  // ── Voice recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {
      Alert.alert('Error', 'Could not start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    if (uri) {
      const path = `${user?.id}/voice_${Date.now()}.m4a`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const ab = await blob.arrayBuffer();

      const { error } = await supabase.storage.from(BUCKET_MEDIA).upload(path, ab, {
        contentType: 'audio/m4a',
      });

      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(path);
        await sendMessage('', 'voice', publicUrl);
      }
    }
  };

  // ── Panic Delete ─────────────────────────────────────────────────────────
  const handlePanicDelete = async () => {
    setShowPanicConfirm(false);
    await (supabase.rpc as any)('panic_delete_conversation', { conv_id: conversationId });
    removeConversation(conversationId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.back();
  };

  // ── Ephemeral Message Wrapper ────────────────────────────────────────────
  const EphemeralText = ({ content, msgId }: { content: string, msgId: string }) => {
    const [expired, setExpired] = useState(false);
    useEffect(() => {
      const timer = setTimeout(() => {
        setExpired(true);
        // Optionally delete from Supabase, but local is fine for disguise
      }, 10000); // 10 seconds for demo
      return () => clearTimeout(timer);
    }, []);

    if (expired) return <Text style={styles.deletedText}>Message expired ⏳</Text>;
    return <Text style={[styles.bubbleText, styles.ephemeralText]}>🔥 {content}</Text>;
  };

  // ── Message bubble ───────────────────────────────────────────────────────
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender_id === user?.id;
    const isDeleted = item.is_deleted;
    const timestamp = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const isEph = item.content?.startsWith('[EPH]');
    const cleanContent = isEph ? item.content?.slice(5) : item.content;

    return (
      <AnimatedBubble
        isMine={isMine}
        index={index}
        timestamp={timestamp}
        isRead={item.is_read}
      >
        {isDeleted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <AppIcon name="close" size={14} color={Colors.labelTertiary} />
            <Text style={styles.deletedText}>Message deleted</Text>
          </View>
        ) : item.message_type === 'image' && item.media_url ? (
          <Image source={{ uri: item.media_url }} style={styles.mediaImage} resizeMode="cover" />
        ) : item.message_type === 'video' && item.media_url ? (
          <TouchableOpacity onPress={() => Linking.openURL(item.media_url!)}>
            <Image source={{ uri: item.media_url }} style={styles.mediaImage} resizeMode="cover" />
            <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center'}}>
               <AppIcon name="play" size={48} color="rgba(255,255,255,0.8)" />
            </View>
          </TouchableOpacity>
        ) : item.message_type === 'document' && item.media_url ? (
          <TouchableOpacity 
            style={styles.voiceRow} 
            onPress={() => Linking.openURL(item.media_url!)}
          >
            <AppIcon name="file" size={18} color={isMine ? '#fff' : Colors.label} />
            <Text style={[styles.voiceText, isMine && styles.voiceTextMine]} numberOfLines={1}>
              {item.content || 'Document'}
            </Text>
          </TouchableOpacity>
        ) : item.message_type === 'voice' && item.media_url ? (
          <TouchableOpacity style={styles.voiceRow} onPress={() => Linking.openURL(item.media_url!)}>
            <AppIcon name="mic" size={18} color={isMine ? '#fff' : Colors.label} />
            <Text style={[styles.voiceText, isMine && styles.voiceTextMine]}>Voice note</Text>
            <Text style={styles.voicePlayIcon}>▶</Text>
          </TouchableOpacity>
        ) : item.message_type === 'gif' && item.media_url ? (
          <Image source={{ uri: item.media_url }} style={styles.mediaImage} resizeMode="contain" />
        ) : isEph ? (
          <EphemeralText content={cleanContent || ''} msgId={item.id} />
        ) : (
          <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
            {cleanContent}
          </Text>
        )}
      </AnimatedBubble>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <BlurView intensity={72} tint="light" style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <AppIcon name="back" size={24} color={Colors.blue} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.partnerInfo} onPress={() => setShowProfilePic(true)}>
          <View style={styles.headerAvatarWrap}>
            {partner?.profile_image ? (
              <Image source={{ uri: partner.profile_image }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarFallback}>
                <Text style={styles.headerAvatarInitial}>{partner?.alias?.[0]}</Text>
              </View>
            )}
            {partner?.is_online && <View style={styles.onlineDot} />}
          </View>
          <View>
            <Text style={styles.headerAlias}>{partner?.alias || '...'}</Text>
            <Text style={styles.headerStatus}>
              {partner?.is_online ? 'Online' : 'Offline'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={styles.panicBtn}
            onPress={() => setShowOptions(true)}
          >
            <Text style={{ fontSize: 20, color: Colors.label, fontWeight: '700', paddingBottom: 6 }}>⋮</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.panicBtn}
            onLongPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              setShowPanicConfirm(true);
            }}
          >
            <AppIcon name="trash" size={17} color={Colors.label} />
          </TouchableOpacity>
        </View>
      </BlurView>

      {/* ── Typing indicator ──────────────────────────────── */}
      {typingVisible && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>{partner?.alias} is typing...</Text>
        </View>
      )}

      {/* ── Messages ─────────────────────────────────────── */}
      <FlatList
        ref={flatRef}
        data={convMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <AppIcon name="wave" size={48} color={Colors.labelSecondary} />
            <Text style={styles.emptyChatText}>Say hello to {partner?.alias}!</Text>
          </View>
        }
      />

      {/* ── Input Bar ─────────────────────────────────────── */}
      <BlurView intensity={60} tint="light" style={styles.inputBar}>
        <TouchableOpacity
          style={[styles.attachBtn, isEphemeral && { backgroundColor: Colors.orange }]}
          onPress={() => {
            setIsEphemeral(!isEphemeral);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <AppIcon name="fire" size={18} color={isEphemeral ? '#fff' : Colors.labelSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.attachBtn}
          onPress={() => setShowAttach(!showAttach)}
        >
          <AppIcon name="attach" size={20} color={Colors.blue} />
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          placeholder="iMessage..."
          placeholderTextColor={Colors.labelTertiary}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />

        {text.trim() ? (
          <Animated.View style={sendAnimStyle}>
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                sendScale.value = withSpring(0.8, { damping: 12, stiffness: 400 });
                setTimeout(() => {
                  sendScale.value = withSpring(1, { damping: 12, stiffness: 400 });
                }, 100);
                sendMessage(text.trim());
              }}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendIcon}>↑</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <TouchableOpacity
            style={[styles.sendBtn, styles.voiceBtn, isRecording && styles.voiceBtnActive]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
          >
            <AppIcon name={isRecording ? 'stop' : 'mic'} size={17} color="#fff" />
          </TouchableOpacity>
        )}
      </BlurView>

      {/* ── Attach panel ─────────────────────────────────── */}
      {showAttach && (
        <View style={styles.attachPanel}>
          {[
            { icon: 'image', label: 'Photo/Video', action: pickAndSendMedia },
            { icon: 'file', label: 'Document', action: pickAndSendDocument },
            { icon: 'film', label: 'GIF', action: pickAndSendMedia },
          ].map((item) => (
            <TouchableOpacity key={item.label} style={styles.attachItem} onPress={item.action}>
              <AppIcon name={item.icon as any} size={32} color={Colors.label} />
              <Text style={styles.attachItemLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Panic confirm ─────────────────────────────────── */}
      <Modal visible={showPanicConfirm} transparent animationType="fade">
        <View style={styles.panicOverlay}>
          <View style={styles.panicCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AppIcon name="warning" size={22} color={Colors.label} />
              <Text style={[styles.panicTitle, { marginBottom: 0 }]}>Panic Delete</Text>
            </View>
            <Text style={styles.panicDesc}>
              This will permanently delete ALL messages in this conversation for both sides.
              This cannot be undone.
            </Text>
            <TouchableOpacity style={styles.panicConfirmBtn} onPress={handlePanicDelete}>
              <Text style={styles.panicConfirmText}>DELETE EVERYTHING</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.panicCancelBtn} onPress={() => setShowPanicConfirm(false)}>
              <Text style={styles.panicCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Profile Picture Modal ──────────────────────────── */}
      <Modal visible={showProfilePic} transparent animationType="fade">
        <View style={styles.panicOverlay}>
          <TouchableOpacity style={styles.modalBgClose} onPress={() => setShowProfilePic(false)} />
          {partner?.profile_image ? (
            <Image source={{ uri: partner.profile_image }} style={styles.fullProfileImage} />
          ) : (
            <View style={[styles.fullProfileImage, styles.fullProfileFallback]}>
              <Text style={styles.fullProfileInitial}>{partner?.alias?.[0]}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.closeProfileBtn} onPress={() => setShowProfilePic(false)}>
            <AppIcon name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── WhatsApp-like Options Modal ────────────────────── */}
      <Modal visible={showOptions} transparent animationType="fade">
        <View style={styles.panicOverlay}>
          <TouchableOpacity style={styles.modalBgClose} onPress={() => setShowOptions(false)} />
          <View style={styles.optionsCard}>
            <Text style={styles.optionsTitle}>Chat Options</Text>
            
            <TouchableOpacity style={styles.optionRow} onPress={() => {
              setShowOptions(false);
              setShowProfilePic(true);
            }}>
              <AppIcon name="person" size={20} color={Colors.label} />
              <Text style={styles.optionText}>View Profile Picture</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.optionRow} onPress={() => {
              setShowOptions(false);
              Alert.alert('Clear Chat', 'This will delete all messages locally.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => {
                  removeMessages(conversationId);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
              ]);
            }}>
              <AppIcon name="trash" size={20} color={Colors.red} />
              <Text style={[styles.optionText, { color: Colors.red }]}>Clear Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionRow} onPress={() => {
              setShowOptions(false);
              Alert.alert('Block User', `Are you sure you want to block ${partner?.alias}?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Block', style: 'destructive', onPress: () => {
                   router.back();
                }}
              ]);
            }}>
              <AppIcon name="blocked" size={20} color={Colors.red} />
              <Text style={[styles.optionText, { color: Colors.red }]}>Block</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: 0.5, borderBottomColor: Colors.separator,
    gap: 12,
  },
  backBtn: { padding: 6 },
  backIcon: { fontSize: 24, color: Colors.blue, fontWeight: '300' },
  partnerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.online, borderWidth: 2, borderColor: Colors.surface,
  },
  headerAlias: { ...Typography.headline, color: Colors.label },
  headerStatus: { ...Typography.caption1, color: Colors.labelSecondary },
  panicBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.fillSecondary, justifyContent: 'center', alignItems: 'center',
  },
  panicIcon: { fontSize: 17 },

  // Typing
  typingBar: { paddingHorizontal: 20, paddingVertical: 4, backgroundColor: Colors.background },
  typingText: { ...Typography.caption1, color: Colors.labelSecondary, fontStyle: 'italic' },

  // Messages
  messagesContent: { padding: 12, paddingBottom: 20, flexGrow: 1 },
  msgRow: { flexDirection: 'row', marginVertical: 3, maxWidth: MAX_BUBBLE_W },
  msgRowRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgRowLeft: { alignSelf: 'flex-start' },
  senderAvatarInline: { marginBottom: 4 },
  senderAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  senderAvatarFallback: { backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center' },
  senderAvatarInitial: { color: '#fff', fontSize: 12, fontWeight: '700' },

  bubble: {
    borderRadius: Radii.bubble, padding: 10,
    maxWidth: MAX_BUBBLE_W, ...Shadows.sm,
  },
  bubbleMine: {
    backgroundColor: Colors.bubbleOutgoing,
    borderBottomRightRadius: Radii.bubbleTail,
  },
  bubbleTheirs: {
    backgroundColor: Colors.bubbleIncoming,
    borderBottomLeftRadius: Radii.bubbleTail,
  },
  mediaBubble: { padding: 4, overflow: 'hidden' },
  bubbleText: { ...Typography.body, color: Colors.bubbleIncomingText },
  bubbleTextMine: { color: Colors.bubbleOutgoingText },
  bubbleTime: {
    ...Typography.caption2, color: 'rgba(0,0,0,0.4)',
    marginTop: 4, alignSelf: 'flex-end',
  },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.6)' },
  deletedText: { ...Typography.subheadline, color: Colors.labelTertiary, fontStyle: 'italic' },
  ephemeralText: { fontStyle: 'italic', color: Colors.orange },
  mediaImage: { width: 220, height: 180, borderRadius: Radii.md },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  voiceIcon: { fontSize: 18 },
  voiceText: { ...Typography.subheadline, color: Colors.label },
  voiceTextMine: { color: '#fff' },
  voicePlayIcon: { fontSize: 12 },

  // Empty
  emptyChat: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyChatIcon: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { ...Typography.subheadline, color: Colors.labelSecondary },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 28,
    borderTopWidth: 0.5, borderTopColor: Colors.separator, gap: 8,
  },
  attachBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.fillSecondary, justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  attachIcon: { fontSize: 20, color: Colors.blue, fontWeight: '300' },
  textInput: {
    flex: 1, ...Typography.body, color: Colors.label,
    backgroundColor: Colors.fillTertiary, borderRadius: 20,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8,
    maxHeight: 120,
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  voiceBtn: { backgroundColor: Colors.fillSecondary },
  voiceBtnActive: { backgroundColor: Colors.red },
  sendIcon: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Attach panel
  attachPanel: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: Colors.surface, paddingVertical: 16, paddingBottom: 28,
    borderTopWidth: 0.5, borderTopColor: Colors.separator,
  },
  attachItem: { alignItems: 'center', gap: 6 },
  attachItemIcon: { fontSize: 32 },
  attachItemLabel: { ...Typography.caption2, color: Colors.labelSecondary },

  // Panic
  panicOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  panicCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.sheet,
    padding: 28, alignItems: 'center', ...Shadows.lg, width: '100%',
  },
  panicTitle: { fontSize: 22, fontWeight: '800', color: Colors.label, marginBottom: 12 },
  panicDesc: { ...Typography.subheadline, color: Colors.labelSecondary, textAlign: 'center', marginBottom: 24 },
  panicConfirmBtn: {
    backgroundColor: Colors.red, borderRadius: Radii.lg,
    paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 10,
  },
  panicConfirmText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  panicCancelBtn: { paddingVertical: 10 },
  panicCancelText: { color: Colors.blue, fontSize: 16, fontWeight: '600' },

  // New Modals
  modalBgClose: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  fullProfileImage: { width: SCREEN_W * 0.8, height: SCREEN_W * 0.8, borderRadius: Radii.lg },
  fullProfileFallback: { backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center' },
  fullProfileInitial: { fontSize: 80, color: '#fff', fontWeight: '700' },
  closeProfileBtn: { position: 'absolute', top: 60, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  
  optionsCard: { backgroundColor: Colors.surface, borderRadius: Radii.sheet, padding: 24, width: SCREEN_W * 0.8, ...Shadows.lg },
  optionsTitle: { ...Typography.title3, color: Colors.label, marginBottom: 20 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.separator },
  optionText: { ...Typography.body, color: Colors.label },
});
