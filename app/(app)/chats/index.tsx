import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Image, Dimensions, RefreshControl,
} from 'react-native';
import Animated, { FadeInRight, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/services/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import AppIcon, { IconName } from '@/components/ui/AppIcon';
import type { ConversationWithPartner, FriendRequest, AppUser } from '@/types/database';

const { width: SCREEN_W } = Dimensions.get('window');

// Extended type for friend request with sender info
interface FriendRequestWithSender extends FriendRequest {
  sender: AppUser;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat List — iMessage-style conversation list with friend request management
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { conversations, setConversations } = useChatStore();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<FriendRequestWithSender[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [existingFriends, setExistingFriends] = useState<Set<string>>(new Set());

  // ── Load sent requests & friendships ──────────────────────────────────────
  const loadRelationships = useCallback(async () => {
    if (!user) return;

    // Load pending sent requests
    const { data: sentData } = await (supabase.from('friend_requests') as any)
      .select('receiver_id')
      .eq('sender_id', user.id)
      .eq('status', 'pending');
    if (sentData) {
      setSentRequests(new Set((sentData as any[]).map((r: any) => r.receiver_id)));
    }

    // Load existing friendships
    const { data: friendsData } = await supabase
      .from('friendships')
      .select('user_one, user_two')
      .or(`user_one.eq.${user.id},user_two.eq.${user.id}`);
    if (friendsData) {
      const friendIds = new Set(
        (friendsData as any[]).map((f: any) =>
          f.user_one === user.id ? f.user_two : f.user_one
        )
      );
      setExistingFriends(friendIds);
    }
  }, [user]);

  // ── Load pending friend requests ─────────────────────────────────────────
  const loadFriendRequests = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from('friend_requests') as any)
      .select('*')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      // Fetch sender profiles
      const senderIds = (data as any[]).map((r: any) => r.sender_id);
      const { data: senders } = await supabase
        .from('users')
        .select('id, username, alias, profile_image, is_online, last_seen')
        .in('id', senderIds);

      const sendersArr = (senders || []) as any[];
      const requestsWithSenders: FriendRequestWithSender[] = (data as any[]).map((req: any) => ({
        ...req,
        sender: sendersArr.find((s: any) => s.id === req.sender_id) as AppUser,
      })).filter((r: any) => r.sender);

      setPendingRequests(requestsWithSenders);
    } else {
      setPendingRequests([]);
    }
  }, [user]);

  // ── Accept friend request ────────────────────────────────────────────────
  const acceptRequest = async (requestId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const req = pendingRequests.find(r => r.id === requestId);
    await (supabase.rpc as any)('accept_friend_request', { request_id: requestId });
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    // Add to friends set
    if (req) {
      setExistingFriends(prev => new Set([...prev, req.sender_id]));
    }
    await loadConversations();
  };

  // ── Decline friend request ───────────────────────────────────────────────
  const declineRequest = async (requestId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await (supabase.from('friend_requests') as any).update({ status: 'rejected' }).eq('id', requestId);
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc('get_chat_list');
    
    if (!error && data) {
      const uniqueConvs: ConversationWithPartner[] = [];
      const seenPartners = new Set<string>();
      
      const parsedData = (data as any[]).map(row => ({
        id: row.conversation_id,
        created_at: row.created_at,
        last_message: row.last_message,
        last_message_at: row.last_message_at,
        last_message_type: row.last_message_type,
        partner: row.partner
      }));

      // Filter out duplicate partners (keep the most recent conversation)
      for (const conv of parsedData) {
        if (conv.partner && !seenPartners.has(conv.partner.id)) {
          seenPartners.add(conv.partner.id);
          uniqueConvs.push(conv);
        }
      }
      
      setConversations(uniqueConvs);
    }
  }, [user]);

  useEffect(() => {
    loadConversations();
    loadFriendRequests();
    loadRelationships();

    // Realtime subscription
    if (!user) return;
    const channel = supabase
      .channel('chats_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => loadConversations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, () => loadConversations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
        loadFriendRequests();
        loadRelationships();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => loadRelationships())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const searchUsers = async (query: string) => {
    setFriendSearch(query);
    if (query.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('users')
      .select('id, username, alias, profile_image')
      .ilike('username', `%${query}%`)
      .neq('id', user?.id || '')
      .limit(10);
    setSearchResults(data || []);
  };

  const sendFriendRequest = async (receiverId: string) => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await (supabase.from('friend_requests') as any).insert({
      sender_id: user.id, receiver_id: receiverId,
    });
    if (!error) {
      // Add to sent requests set — user stays visible with "Requested" state
      setSentRequests(prev => new Set([...prev, receiverId]));
    }
  };

  // Get the relationship status for a user in search results
  const getRelationStatus = (userId: string): 'add' | 'requested' | 'friends' => {
    if (existingFriends.has(userId)) return 'friends';
    if (sentRequests.has(userId)) return 'requested';
    return 'add';
  };

  const handleUserTap = (userId: string, status: string) => {
    if (status === 'friends') {
      const conv = conversations.find(c => c.partner?.id === userId);
      if (conv) {
        setShowSearch(false);
        router.push(`/(app)/chats/${conv.id}`);
      }
    }
  };

  const filtered = search
    ? conversations.filter((c) =>
        c.partner.alias.toLowerCase().includes(search.toLowerCase()) ||
        c.partner.username.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // ── List header: Friend Requests ─────────────────────────────────────────
  const renderListHeader = () => {
    if (pendingRequests.length === 0) return null;
    return (
      <Animated.View entering={FadeInDown.springify().damping(20).stiffness(160)}>
        <View style={styles.requestsSection}>
          <Text style={styles.requestsTitle}>
            Friend Requests ({pendingRequests.length})
          </Text>
          {pendingRequests.map((req, idx) => (
            <Animated.View
              key={req.id}
              entering={FadeInRight.delay(idx * 80).springify().damping(18).stiffness(180)}
            >
              <View style={styles.requestRow}>
                <View style={styles.requestAvatarWrap}>
                  {req.sender.profile_image ? (
                    <Image source={{ uri: req.sender.profile_image }} style={styles.requestAvatar} />
                  ) : (
                    <View style={styles.requestAvatarFallback}>
                      <Text style={styles.requestAvatarInitial}>
                        {req.sender.alias[0]?.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestAlias}>{req.sender.alias}</Text>
                  <Text style={styles.requestUsername}>@{req.sender.username}</Text>
                </View>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => acceptRequest(req.id)}
                >
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={() => declineRequest(req.id)}
                >
                  <Text style={styles.declineBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <BlurView intensity={70} tint="light" style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Messages</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => setShowSearch(!showSearch)}
            >
              <AppIcon name="search" size={17} color={Colors.label} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push('/(app)/settings')}
            >
              <AppIcon name="settings" size={17} color={Colors.label} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <AppIcon name="search" size={15} color={Colors.label} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={Colors.labelTertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </BlurView>

      {/* ── Friend Search Panel ─────────────────────────────── */}
      {showSearch && (
        <Animated.View entering={FadeInDown.duration(200).springify().damping(20).stiffness(200)}>
          <View style={styles.friendSearchPanel}>
            <View style={styles.friendSearchBar}>
              <AppIcon name="person" size={15} color={Colors.label} />
              <TextInput
                style={styles.searchInput}
                placeholder="Find users by username..."
                placeholderTextColor={Colors.labelTertiary}
                value={friendSearch}
                onChangeText={searchUsers}
                autoFocus
              />
              {friendSearch ? (
                <TouchableOpacity onPress={() => { setFriendSearch(''); setSearchResults([]); }}>
                  <Text style={{ color: Colors.blue }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {searchResults.map((u) => {
              const status = getRelationStatus(u.id);
              return (
                <TouchableOpacity 
                  key={u.id} 
                  style={styles.searchResultRow}
                  onPress={() => handleUserTap(u.id, status)}
                  activeOpacity={status === 'friends' ? 0.7 : 1}
                >
                  <View style={styles.searchResultAvatar}>
                    {u.profile_image ? (
                      <Image source={{ uri: u.profile_image }} style={styles.searchResultAvatarImg} />
                    ) : (
                      <Text style={styles.avatarInitials}>{u.alias?.[0]?.toUpperCase() || '?'}</Text>
                    )}
                  </View>
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.searchResultAlias}>{u.alias}</Text>
                    <Text style={styles.searchResultUsername}>@{u.username}</Text>
                  </View>
                  {status === 'friends' ? (
                    <View style={styles.friendsBadge}>
                      <AppIcon name="check" size={13} color={Colors.green} />
                      <Text style={styles.friendsBadgeText}>Friends</Text>
                    </View>
                  ) : status === 'requested' ? (
                    <View style={styles.requestedBtn}>
                      <AppIcon name="clock" size={13} color={Colors.labelSecondary} />
                      <Text style={styles.requestedBtnText}>Requested</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => sendFriendRequest(u.id)}
                    >
                      <Text style={styles.addBtnText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}

            {friendSearch.length >= 2 && searchResults.length === 0 && (
              <View style={styles.noResultsRow}>
                <Text style={styles.noResultsText}>No users found for "{friendSearch}"</Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* ── Conversation List ────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderListHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([loadConversations(), loadFriendRequests()]);
            setRefreshing(false);
          }} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppIcon name="chat" size={56} color={Colors.labelSecondary} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>Search for users above to start chatting</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const partner = item.partner;
          const isOnline = partner.is_online;

          return (
            <Animated.View
              entering={FadeInRight.delay(index * 50).springify().damping(20).stiffness(180)}
            >
              <TouchableOpacity
                style={styles.conversationRow}
                onPress={() => router.push(`/(app)/chats/${item.id}`)}
                activeOpacity={0.75}
              >
                {/* Avatar */}
                <View style={styles.avatarWrapper}>
                  {partner.profile_image ? (
                    <Image source={{ uri: partner.profile_image }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitials}>
                        {partner.alias[0]?.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {isOnline && <View style={styles.onlineDot} />}
                </View>

                {/* Info */}
                <View style={styles.convInfo}>
                  <View style={styles.convTop}>
                    <Text style={styles.convAlias}>{partner.alias}</Text>
                    <Text style={styles.convTime}>{timeAgo(item.last_message_at)}</Text>
                  </View>
                  <Text style={styles.convLastMsg} numberOfLines={1}>
                    {item.last_message || 'Start a conversation...'}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* ── Bottom Tab ─────────────────────────────────────── */}
      <View style={styles.bottomTab}>
        {[
          { icon: 'chat', label: 'Chats', active: true, path: '/(app)/chats' },
          { icon: 'lock', label: 'Vault', active: false, path: '/(app)/vault' },
          { icon: 'settings', label: 'Settings', active: false, path: '/(app)/settings' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.label}
            style={styles.tabItem}
            onPress={() => router.push(tab.path as any)}
          >
            <AppIcon name={tab.icon as IconName} size={22} color={tab.active ? Colors.blue : Colors.labelSecondary} />
            <Text style={[styles.tabLabel, tab.active && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingTop: 56, paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.separator,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { ...Typography.largeTitle, color: Colors.label },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.fillSecondary, justifyContent: 'center', alignItems: 'center',
  },
  headerBtnIcon: { fontSize: 17 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.fillTertiary, borderRadius: Radii.lg,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, ...Typography.subheadline, color: Colors.label },

  // Friend search
  friendSearchPanel: {
    backgroundColor: Colors.surface, paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.separator,
  },
  friendSearchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.fillTertiary, borderRadius: Radii.lg,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 8,
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12,
  },
  searchResultAvatar: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center',
  },
  searchResultAvatarImg: { width: '100%', height: '100%' },
  searchResultInfo: { flex: 1 },
  searchResultAlias: { ...Typography.headline, color: Colors.label },
  searchResultUsername: { ...Typography.footnote, color: Colors.labelSecondary },
  addBtn: {
    backgroundColor: Colors.blue, borderRadius: Radii.full,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  requestedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.fillTertiary, borderRadius: Radii.full,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  requestedBtnText: { color: Colors.labelSecondary, fontWeight: '600', fontSize: 13 },
  friendsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(52,199,89,0.12)', borderRadius: Radii.full,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  friendsBadgeText: { color: Colors.green, fontWeight: '600', fontSize: 13 },
  noResultsRow: { paddingVertical: 16, alignItems: 'center' },
  noResultsText: { ...Typography.subheadline, color: Colors.labelTertiary },

  // Friend requests section
  requestsSection: {
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  requestsTitle: {
    ...Typography.footnote,
    fontWeight: '700',
    color: Colors.blue,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  requestRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12,
  },
  requestAvatarWrap: {},
  requestAvatar: { width: 48, height: 48, borderRadius: 24 },
  requestAvatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.purple, justifyContent: 'center', alignItems: 'center',
  },
  requestAvatarInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },
  requestInfo: { flex: 1 },
  requestAlias: { ...Typography.headline, color: Colors.label },
  requestUsername: { ...Typography.caption1, color: Colors.labelSecondary },
  acceptBtn: {
    backgroundColor: Colors.blue, borderRadius: Radii.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  declineBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.fillSecondary,
    justifyContent: 'center', alignItems: 'center',
  },
  declineBtnText: { fontSize: 14, color: Colors.labelSecondary, fontWeight: '600' },

  // List
  listContent: { paddingTop: 8, paddingBottom: 100 },
  conversationRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding, paddingVertical: 12,
    backgroundColor: Colors.surface,
  },
  avatarWrapper: { position: 'relative', marginRight: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.blue, justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: { color: '#fff', fontSize: 22, fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.online,
    borderWidth: 2, borderColor: Colors.surface,
  },
  convInfo: { flex: 1 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  convAlias: { ...Typography.headline, color: Colors.label },
  convTime: { ...Typography.caption1, color: Colors.labelSecondary },
  convLastMsg: { ...Typography.subheadline, color: Colors.labelSecondary },
  separator: { height: 0.5, backgroundColor: Colors.separator, marginLeft: 84 },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { ...Typography.title3, color: Colors.label, marginBottom: 8 },
  emptySubtitle: { ...Typography.subheadline, color: Colors.labelSecondary, textAlign: 'center', paddingHorizontal: 40 },

  // Bottom tab
  bottomTab: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderTopWidth: 0.5, borderTopColor: Colors.separator,
    paddingBottom: 28, paddingTop: 8, ...Shadows.sm,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon: { fontSize: 22 },
  tabLabel: { ...Typography.caption2, color: Colors.labelSecondary, fontWeight: '500' },
  tabLabelActive: { color: Colors.blue, fontWeight: '700' },
});
