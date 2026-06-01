import React from 'react';
import {
  View, Text, TouchableOpacity, Image, FlatList,
  StyleSheet, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useShopStore } from '@/store/shopStore';
import { useAuthStore } from '@/store/authStore';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import AppIcon from '@/components/ui/AppIcon';

const STATUS_COLORS: Record<string, string> = {
  Delivered: Colors.green,
  Shipped: Colors.blue,
  Processing: Colors.orange,
  Cancelled: Colors.red,
};

export default function OrdersScreen() {
  const router = useRouter();
  const { orders } = useShopStore();
  const { isAuthenticated } = useAuthStore();

  const renderEmptyState = () => (
    <Animated.View entering={FadeIn.duration(300)} style={styles.emptyContainer}>
      <AppIcon name="package" size={64} color={Colors.labelTertiary} />
      <Text style={styles.emptyTitle}>No Orders Found</Text>
      <Text style={styles.emptySubtitle}>
        {isAuthenticated
          ? "You haven't placed any orders yet. Explore our store to find products!"
          : "You need an account to view and track orders. Please sign in or register to get started."}
      </Text>
      {!isAuthenticated && (
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.push('/(auth)/stealth-login')}
        >
          <Text style={styles.loginBtnText}>Sign In / Register</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
        <View style={{ width: 60 }} />
      </View>

      {!isAuthenticated || orders.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(index * 50).springify()}>
              <View style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <Text style={styles.orderId}>{item.id}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.orderBody}>
                  {item.imageUrl && (
                    <Image source={{ uri: item.imageUrl }} style={styles.orderImage} />
                  )}
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderName}>{item.productName}</Text>
                    <Text style={styles.orderDate}>Ordered on {item.date}</Text>
                    <Text style={styles.orderAmount}>₹{item.amount.toLocaleString()}</Text>
                  </View>
                </View>
                {item.status === 'Shipped' && (
                  <View style={styles.trackingBar}>
                    <View style={styles.trackDot} />
                    <View style={styles.trackLine} />
                    <View style={styles.trackDot} />
                    <View style={[styles.trackLine, styles.trackLineInactive]} />
                    <View style={[styles.trackDot, styles.trackDotInactive]} />
                    <View style={[styles.trackLine, styles.trackLineInactive]} />
                    <View style={[styles.trackDot, styles.trackDotInactive]} />
                  </View>
                )}
                {item.status === 'Shipped' && (
                  <View style={styles.trackLabels}>
                    <Text style={styles.trackLabel}>Ordered</Text>
                    <Text style={styles.trackLabel}>Shipped</Text>
                    <Text style={styles.trackLabelInactive}>Out</Text>
                    <Text style={styles.trackLabelInactive}>Delivered</Text>
                  </View>
                )}
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

  orderCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.card,
    padding: 16, marginBottom: 12, ...Shadows.sm,
  },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  orderId: { ...Typography.footnote, color: Colors.labelSecondary, fontWeight: '600' },
  statusBadge: { borderRadius: Radii.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },

  orderBody: { flexDirection: 'row', alignItems: 'center' },
  orderImage: { width: 60, height: 60, borderRadius: Radii.sm },
  orderInfo: { flex: 1, marginLeft: 12 },
  orderName: { ...Typography.subheadline, color: Colors.label, fontWeight: '600', marginBottom: 2 },
  orderDate: { ...Typography.caption1, color: Colors.labelTertiary, marginBottom: 4 },
  orderAmount: { ...Typography.headline, color: Colors.shopAccent },

  // Tracking
  trackingBar: {
    flexDirection: 'row', alignItems: 'center', marginTop: 16,
    paddingHorizontal: 8,
  },
  trackDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.green,
  },
  trackDotInactive: { backgroundColor: Colors.separatorOpaque },
  trackLine: { flex: 1, height: 3, backgroundColor: Colors.green },
  trackLineInactive: { backgroundColor: Colors.separatorOpaque },
  trackLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 4,
    paddingHorizontal: 0,
  },
  trackLabel: { ...Typography.caption2, color: Colors.green, fontWeight: '600' },
  trackLabelInactive: { ...Typography.caption2, color: Colors.labelTertiary },

  // Empty State Styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding * 2,
    paddingBottom: 80,
  },
  emptyTitle: {
    ...Typography.title3,
    color: Colors.label,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.labelSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  loginBtn: {
    backgroundColor: Colors.shopAccent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radii.md,
    ...Shadows.sm,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
