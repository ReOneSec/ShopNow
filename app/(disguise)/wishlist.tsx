import React from 'react';
import {
  View, Text, TouchableOpacity, Image, FlatList,
  StyleSheet, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useShopStore } from '@/store/shopStore';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import AppIcon from '@/components/ui/AppIcon';

export default function WishlistScreen() {
  const router = useRouter();
  const { wishlist, toggleWishlist, addToCart } = useShopStore();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wishlist</Text>
        <View style={{ width: 60 }} />
      </View>

      {wishlist.length === 0 ? (
        <View style={styles.emptyState}>
          <AppIcon name="heart" size={64} color={Colors.labelSecondary} />
          <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
          <Text style={styles.emptySubtitle}>Save items you love to buy them later</Text>
          <TouchableOpacity style={styles.shopBtn} onPress={() => router.back()}>
            <Text style={styles.shopBtnText}>Browse Products</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={wishlist}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(index * 50).springify()}>
              <View style={styles.card}>
                <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.cardPrice}>₹{(item.price ?? 0).toLocaleString()}</Text>
                    <Text style={styles.cardOrigPrice}>₹{(item.originalPrice ?? item.price ?? 0).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.cardRating}>⭐ {item.rating} ({(item.reviews ?? 0).toLocaleString()})</Text>
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.cartBtn}
                      onPress={() => {
                        addToCart(item);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }}
                    >
                      <Text style={styles.cartBtnText}>Add to Cart</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeWishBtn}
                      onPress={() => {
                        toggleWishlist(item);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }}
                    >
                      <AppIcon name="trash" size={18} color={Colors.red} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenPadding, paddingTop: 56, paddingBottom: 16,
    backgroundColor: Colors.surface, ...Shadows.sm,
  },
  backBtn: { width: 60 },
  backText: { ...Typography.body, color: Colors.blue },
  headerTitle: { ...Typography.title3, color: Colors.label },
  list: { padding: Spacing.screenPadding },

  card: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radii.card,
    padding: 12, marginBottom: 12, ...Shadows.sm,
  },
  cardImage: { width: 100, height: 100, borderRadius: Radii.md },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { ...Typography.subheadline, color: Colors.label, fontWeight: '600', marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardPrice: { fontSize: 16, fontWeight: '800', color: Colors.shopAccent },
  cardOrigPrice: { fontSize: 12, color: Colors.labelTertiary, textDecorationLine: 'line-through' },
  cardRating: { ...Typography.caption1, color: Colors.shopGold, marginBottom: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartBtn: {
    backgroundColor: Colors.shopAccent, borderRadius: Radii.full,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  cartBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  removeWishBtn: { padding: 8 },
  removeWishText: { fontSize: 18 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { ...Typography.title3, color: Colors.label, marginBottom: 8 },
  emptySubtitle: { ...Typography.subheadline, color: Colors.labelSecondary, textAlign: 'center', marginBottom: 24 },
  shopBtn: { backgroundColor: Colors.shopAccent, borderRadius: Radii.full, paddingVertical: 14, paddingHorizontal: 32 },
  shopBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
