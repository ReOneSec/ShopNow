import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  AppState,
  BackHandler,
  StatusBar,
  Alert,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInUp,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radii, Shadows, Typography } from '@/constants/theme';
import AppIcon, { IconName } from '@/components/ui/AppIcon';
import { FAKE_PRODUCTS, FAKE_CATEGORIES, FAKE_BANNERS } from '@/constants/fakeData';
import {
  MAX_DISGUISE_TAPS,
  INACTIVITY_TIMEOUT_SECONDS,
} from '@/constants/config';
import { useShopStore } from '@/store/shopStore';
import { useAuthStore } from '@/store/authStore';

const { width: SCREEN_W } = Dimensions.get('window');
const BANNER_W = SCREEN_W - Spacing.screenPadding * 2;

// ─────────────────────────────────────────────────────────────────────────────
// Extracted Product Card component to avoid calling hooks inside .map()
// ─────────────────────────────────────────────────────────────────────────────
function ProductCard({
  product,
  idx,
  onTap,
  onAddToCart,
  onToggleWishlist,
  isWishlisted,
}: {
  product: any;
  idx: number;
  onTap: () => void;
  onAddToCart: () => void;
  onToggleWishlist: () => void;
  isWishlisted: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInUp.delay(idx * 60).springify().damping(18).stiffness(180)}
      style={animatedStyle}
    >
      <TouchableOpacity
        style={styles.productCard}
        onPressIn={() => { scale.value = withSpring(0.96); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={onTap}
        activeOpacity={0.95}
      >
        <View style={styles.productImageWrapper}>
          <Image
            source={{ uri: product.imageUrl }}
            style={styles.productImage}
            resizeMode="cover"
          />
          {product.badge && (
            <View style={styles.productBadge}>
              <Text style={styles.productBadgeText}>{product.badge}</Text>
            </View>
          )}
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{Math.floor(Math.random() * 40) + 10}% OFF</Text>
          </View>
          <TouchableOpacity
            style={styles.wishlistBtn}
            onPress={onToggleWishlist}
          >
            <AppIcon name={isWishlisted ? 'heart-solid' : 'heart'} size={16} color={isWishlisted ? Colors.red : Colors.labelSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={styles.ratingRow}>
            <Text style={styles.ratingText}>⭐ {product.rating}</Text>
            <Text style={styles.reviewsText}>({Math.floor(Math.random() * 500) + 10})</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{product.price.toLocaleString()}</Text>
            <Text style={styles.originalPrice}>₹{Math.floor(product.price * 1.3).toLocaleString()}</Text>
          </View>
          <TouchableOpacity
            style={styles.addToCartBtn}
            onPress={onAddToCart}
          >
            <Text style={styles.addToCartText}>Add to Cart</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Fake Shopping Home — the disguise layer
// ─────────────────────────────────────────────────────────────────────────────
export default function DisguiseHomeScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const [selectedCategory, setSelectedCategory] = useState('1');
  const [searchText, setSearchText] = useState('');
  const [bannerIndex, setBannerIndex] = useState(0);
  const [welcomeModalVisible, setWelcomeModalVisible] = useState(false);

  // Shop store
  const { addToCart, getCartCount, toggleWishlist, isInWishlist, profile, products, fetchLiveProducts, isLoadingProducts } = useShopStore();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    fetchLiveProducts();
  }, []);

  // ── Welcome Popup ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      const timer = setTimeout(() => {
        setWelcomeModalVisible(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  // Security state
  const tapCount = useRef(0);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── DEV_MODE: set to false to re-enable security timers ───────────────
  const DEV_MODE = true;

  // ── Inactivity timer ─────────────────────────────────────────────────────
  // Only active when this disguise screen is focused
  const resetInactivityTimer = useCallback(() => {
    if (DEV_MODE) return; // disabled for development
    if (!isFocused) return;
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      BackHandler.exitApp();
    }, INACTIVITY_TIMEOUT_SECONDS * 1000);
  }, [isFocused]);

  // ── Background detection & inactivity — only when disguise screen is focused ──
  useEffect(() => {
    if (DEV_MODE) return; // disabled for development

    if (!isFocused) {
      // Screen lost focus (e.g. navigated to stealth-login) — clear everything
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
      return;
    }

    // Screen is focused — start security measures
    resetInactivityTimer();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        BackHandler.exitApp();
      }
    });
    return () => {
      sub.remove();
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [isFocused]);

  // ── Banner auto-scroll ───────────────────────────────────────────────────
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setBannerIndex((prev) => {
        const next = (prev + 1) % FAKE_BANNERS.length;
        flatListRef.current?.scrollToIndex({
          index: next,
          animated: true,
        });
        return next;
      });
    }, 3500);
    return () => clearInterval(t);
  }, []);

  // ── Flash Sale Countdown Timer ───────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState({ hours: 2, minutes: 34, seconds: 18 });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        let { hours, minutes, seconds } = prev;
        if (seconds > 0) {
          seconds--;
        } else {
          seconds = 59;
          if (minutes > 0) {
            minutes--;
          } else {
            minutes = 59;
            if (hours > 0) {
              hours--;
            } else {
              hours = 2;
              minutes = 59;
              seconds = 59;
            }
          }
        }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num: number) => num.toString().padStart(2, '0');
  const timerString = `${formatNumber(timeLeft.hours)}:${formatNumber(timeLeft.minutes)}:${formatNumber(timeLeft.seconds)}`;

  // ── Random tap counter (security) ────────────────────────────────────────
  const handleRandomTap = () => {
    resetInactivityTimer();
    tapCount.current += 1;
    if (tapCount.current >= MAX_DISGUISE_TAPS) {
      BackHandler.exitApp();
    }
  };

  // ── Hidden hotspot: customer care icon ────────────────────────────────────
  const hotspotTapCount = useRef(0);
  const hotspotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHotspotPress = () => {
    resetInactivityTimer();
    hotspotTapCount.current += 1;

    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    if (hotspotTimer.current) clearTimeout(hotspotTimer.current);

    if (hotspotTapCount.current >= 10) {
      hotspotTapCount.current = 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/(auth)/stealth-login');
    } else {
      singleTapTimer.current = setTimeout(() => {
        if (hotspotTapCount.current < 10) {
          hotspotTapCount.current = 0;
          router.push('/(disguise)/support');
        }
      }, 600);

      hotspotTimer.current = setTimeout(() => {
        hotspotTapCount.current = 0;
      }, 1200);
    }
  };

  const filteredProducts = selectedCategory === '1'
    ? products
    : products.filter((p) => {
        const cat = FAKE_CATEGORIES.find((c) => c.id === selectedCategory);
        return p.category === cat?.name;
      });

  const searchFiltered = searchText
    ? filteredProducts.filter((p) => p.name.toLowerCase().includes(searchText.toLowerCase()))
    : filteredProducts;

  const cartCount = getCartCount();

  // Skeleton Animation
  const skeletonOpacity = useSharedValue(0.4);
  useEffect(() => {
    skeletonOpacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, []);
  const skeletonStyle = useAnimatedStyle(() => ({ opacity: skeletonOpacity.value }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Welcome, {isAuthenticated && user ? user.alias : profile.name}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleHotspotPress}
            activeOpacity={0.7}
          >
            <AppIcon name="help" size={20} color={Colors.label} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cartBtn}
            onPress={() => {
              resetInactivityTimer();
              router.push('/(disguise)/cart');
            }}
            activeOpacity={0.7}
          >
            <AppIcon name="cart" size={20} color={Colors.label} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={resetInactivityTimer}
      >
        {/* ── Search Bar ──────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.searchContainer}
          onPress={() => {
            resetInactivityTimer();
            router.push('/(disguise)/search');
          }}
          activeOpacity={0.8}
        >
          <AppIcon name="search" size={16} color={Colors.labelTertiary} />
          <Text style={styles.searchPlaceholder}>Search products, brands...</Text>
        </TouchableOpacity>

        {/* ── Banner Carousel ────────────────────────────────── */}
        <View style={styles.bannerContainer}>
          <FlatList
            ref={flatListRef}
            data={FAKE_BANNERS}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            onMomentumScrollEnd={(e) => {
              const contentOffset = e.nativeEvent.contentOffset.x;
              const width = e.nativeEvent.layoutMeasurement.width;
              const index = Math.round(contentOffset / width);
              setBannerIndex(index);
            }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={handleRandomTap}
                activeOpacity={0.9}
                style={styles.bannerCard}
              >
                <Image
                  source={{
                    uri: item.id === 'b1'
                      ? 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800'
                      : item.id === 'b2'
                      ? 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800'
                      : 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=800'
                  }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                />
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
                <View style={{ zIndex: 2 }}>
                  <View style={styles.bannerBadge}>
                    <Text style={styles.bannerBadgeText}>{item.badge}</Text>
                  </View>
                  <Text style={styles.bannerTitle}>{item.title}</Text>
                  <Text style={styles.bannerSubtitle}>{item.subtitle}</Text>
                  <View style={styles.bannerBtn}>
                    <Text style={styles.bannerBtnText}>Shop Now</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
          <View style={styles.dotsRow}>
            {FAKE_BANNERS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === bannerIndex && styles.dotActive]}
              />
            ))}
          </View>
        </View>

        {/* ── Categories ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Categories</Text>
        <FlatList
          data={FAKE_CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesRow}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.categoryChip,
                selectedCategory === item.id && styles.categoryChipActive,
              ]}
              onPress={() => {
                resetInactivityTimer();
                setSelectedCategory(item.id);
              }}
            >
              <Animated.View
                layout={LinearTransition.springify().damping(18).stiffness(200)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <AppIcon name={item.icon as IconName} size={14} color={selectedCategory === item.id ? '#fff' : Colors.label} />
                <Text
                  style={[
                    styles.categoryText,
                    selectedCategory === item.id && styles.categoryTextActive,
                  ]}
                >
                  {item.name}
                </Text>
              </Animated.View>
            </TouchableOpacity>
          )}
        />

        {/* ── Flash Sale Strip ─────────────────────────────────── */}
        <TouchableOpacity
          style={styles.flashStrip}
          onPress={handleRandomTap}
          activeOpacity={0.9}
        >
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1555529669-e69e7aa0db9a?w=800' }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
          <Text style={[styles.flashTitle, { color: '#FFF', zIndex: 2 }]}>⚡ FLASH SALE</Text>
          <Text style={[styles.flashTimer, { color: '#FFD700', zIndex: 2 }]}>Ends in {timerString}</Text>
        </TouchableOpacity>

        {/* ── Product Grid ─────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>
          {selectedCategory === '1' ? 'Featured Products' : FAKE_CATEGORIES.find((c) => c.id === selectedCategory)?.name}
        </Text>
        <View style={styles.productGrid}>
          {isLoadingProducts ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <Animated.View key={idx} style={[styles.productCard, skeletonStyle, { height: 260, backgroundColor: Colors.fillSecondary }]} />
            ))
          ) : (
            searchFiltered.map((product, idx) => (
              <ProductCard
                key={product.id}
                product={product}
                idx={idx}
                onTap={() => {
                  resetInactivityTimer();
                  handleRandomTap();
                }}
                onAddToCart={() => {
                  addToCart(product);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  resetInactivityTimer();
                }}
                onToggleWishlist={() => {
                  toggleWishlist(product);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  resetInactivityTimer();
                }}
                isWishlisted={isInWishlist(product.id)}
              />
            ))
          )}
        </View>

        {/* ── Bottom padding ────────────────────────────────────── */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Nav ──────────────────────────────────────── */}
      <View style={styles.bottomNav}>
        {[
          { icon: 'house', label: 'Home', route: null },
          { icon: 'search', label: 'Search', route: '/(disguise)/search' },
          { icon: 'heart', label: 'Wishlist', route: '/(disguise)/wishlist' },
          { icon: 'package', label: 'Orders', route: '/(disguise)/orders' },
          { icon: 'person', label: 'Profile', route: '/(disguise)/profile' },
        ].map((tab, i) => (
          <TouchableOpacity
            key={i}
            style={styles.navItem}
            onPress={() => {
              resetInactivityTimer();
              if (tab.route) {
                router.push(tab.route as any);
              }
            }}
          >
            <AppIcon name={tab.icon as IconName} size={22} color={i === 0 ? Colors.shopAccent : Colors.labelTertiary} />
            <Text style={[styles.navLabel, i === 0 && styles.navLabelActive]}>{tab.label}</Text>
            {i === 0 && <View style={styles.navDot} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Welcome Custom Modal ────────────────────────────── */}
      {welcomeModalVisible && (
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(200)}
          style={styles.modalOverlay}
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.modalCard}
          >
            <Text style={styles.modalTitle}>Welcome to ShopNow</Text>
            <Text style={styles.modalText}>
              Create an account to track your orders, save items to your wishlist, and get personalized offers.
            </Text>
            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              onPress={() => {
                setWelcomeModalVisible(false);
                router.push('/(auth)/register');
              }}
            >
              <Text style={styles.modalPrimaryBtnText}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              onPress={() => setWelcomeModalVisible(false)}
            >
              <Text style={styles.modalSecondaryBtnText}>Later</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    ...Shadows.sm,
  },
  headerGreeting: { ...Typography.footnote, color: Colors.labelSecondary },
  headerTitle: { ...Typography.title2, color: Colors.label },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.fillTertiary,
    justifyContent: 'center', alignItems: 'center',
  },
  iconBtnText: { fontSize: 18 },
  cartBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.shopAccentLight,
    justifyContent: 'center', alignItems: 'center',
  },
  cartIcon: { fontSize: 18 },
  cartBadge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: Colors.shopAccent, borderRadius: 10,
    minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Search
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.screenPadding,
    marginTop: 16, marginBottom: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg, paddingHorizontal: 14, paddingVertical: 14,
    ...Shadows.sm,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchPlaceholder: { ...Typography.body, color: Colors.labelTertiary },

  // Banner
  bannerContainer: {
    marginHorizontal: Spacing.screenPadding,
    marginVertical: 16,
    height: 165,
  },
  bannerCard: {
    width: BANNER_W, borderRadius: Radii.card,
    padding: 20, minHeight: 140,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    ...Shadows.md,
  },
  bannerBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radii.full, alignSelf: 'flex-start', marginBottom: 8,
  },
  bannerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  bannerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  bannerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginBottom: 16 },
  bannerBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: Radii.full, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  bannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.separatorOpaque },
  dotActive: { backgroundColor: Colors.shopAccent, width: 18 },

  // Categories
  sectionTitle: {
    ...Typography.headline,
    marginHorizontal: Spacing.screenPadding,
    marginTop: 8, marginBottom: 12, color: Colors.label,
  },
  categoriesRow: { paddingHorizontal: Spacing.screenPadding, gap: 8, paddingBottom: 4 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: Colors.surface, borderRadius: Radii.full,
    ...Shadows.sm,
  },
  categoryChipActive: { backgroundColor: Colors.shopAccent },
  categoryIcon: { fontSize: 14 },
  categoryText: { ...Typography.subheadline, color: Colors.labelSecondary, fontWeight: '600' },
  categoryTextActive: { color: '#fff' },

  // Flash sale
  flashStrip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: Spacing.screenPadding, marginTop: 16, marginBottom: 8,
    borderRadius: Radii.md,
    paddingHorizontal: 16, paddingVertical: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  flashTitle: { fontWeight: '800', fontSize: 14, color: Colors.shopAccent },
  flashTimer: { fontWeight: '600', fontSize: 14, color: Colors.shopAccent, fontVariant: ['tabular-nums'] },

  // Product grid
  productGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: Spacing.screenPadding, gap: 12,
  },
  productCard: {
    width: (SCREEN_W - Spacing.screenPadding * 2 - 12) / 2,
    backgroundColor: Colors.surface, borderRadius: Radii.card,
    overflow: 'hidden', ...Shadows.md,
  },
  productImageWrapper: { width: '100%', height: 160, position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  productBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: Colors.blue, borderRadius: Radii.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  productBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  discountBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: Colors.red, borderRadius: Radii.xs,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  discountText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  wishlistBtn: {
    position: 'absolute', bottom: 8, right: 8,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center', alignItems: 'center',
    ...Shadows.sm,
  },
  wishlistIcon: { fontSize: 16 },
  productInfo: { padding: 10 },
  productName: { ...Typography.footnote, color: Colors.label, fontWeight: '600', marginBottom: 4, minHeight: 32 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  ratingText: { fontSize: 12, color: Colors.shopGold, fontWeight: '700' },
  reviewsText: { fontSize: 11, color: Colors.labelSecondary },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  price: { fontSize: 16, fontWeight: '800', color: Colors.label },
  originalPrice: { fontSize: 12, color: Colors.labelTertiary, textDecorationLine: 'line-through' },
  addToCartBtn: {
    backgroundColor: Colors.shopAccent, borderRadius: Radii.sm,
    paddingVertical: 8, alignItems: 'center',
  },
  addToCartText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    paddingBottom: 24, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: Colors.separator,
    ...Shadows.lg,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navIcon: { fontSize: 22 },
  navLabel: { ...Typography.caption2, color: Colors.labelTertiary },
  navLabelActive: { color: Colors.shopAccent, fontWeight: '600' },
  navDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.shopAccent },

  // Custom Modal Styles
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  modalCard: {
    width: SCREEN_W * 0.85,
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    padding: 24,
    alignItems: 'center',
    ...Shadows.lg,
  },
  modalTitle: {
    ...Typography.title3,
    color: Colors.label,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    ...Typography.body,
    color: Colors.labelSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalPrimaryBtn: {
    backgroundColor: Colors.shopAccent,
    width: '100%',
    paddingVertical: 14,
    borderRadius: Radii.md,
    alignItems: 'center',
    marginBottom: 12,
    ...Shadows.sm,
  },
  modalPrimaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSecondaryBtnText: {
    color: Colors.labelSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
