import { create } from 'zustand';
import { FakeProduct, FAKE_ORDERS, FakeOrder } from '@/constants/fakeData';

// ─────────────────────────────────────────────────────────────────────────────
// Shop Store — manages cart, wishlist, profile for the disguise layer
// ─────────────────────────────────────────────────────────────────────────────

export interface CartItem {
  product: FakeProduct;
  quantity: number;
}

interface ShopProfile {
  name: string;
  email: string;
  avatar: string | null;
}

interface ShopState {
  cart: CartItem[];
  wishlist: FakeProduct[];
  profile: ShopProfile;
  orders: FakeOrder[];
  products: FakeProduct[];
  isLoadingProducts: boolean;

  // Product fetching
  fetchLiveProducts: () => Promise<void>;

  // Cart actions
  addToCart: (product: FakeProduct) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getCartCount: () => number;
  getCartTotal: () => number;

  // Wishlist actions
  toggleWishlist: (product: FakeProduct) => void;
  isInWishlist: (productId: string) => boolean;

  // Profile actions
  setProfile: (profile: Partial<ShopProfile>) => void;
}

export const useShopStore = create<ShopState>((set, get) => ({
  cart: [],
  wishlist: [],
  products: [],
  isLoadingProducts: false,
  profile: {
    name: 'Shopper',
    email: '',
    avatar: null,
  },
  orders: [],

  fetchLiveProducts: async () => {
    set({ isLoadingProducts: true });
    try {
      const res = await fetch('https://fakestoreapi.com/products');
      const data = await res.json();
      const mapped: FakeProduct[] = data.map((item: any) => ({
        id: item.id.toString(),
        name: item.title,
        description: item.description,
        price: item.price * 80, // rough conversion to INR
        imageUrl: item.image,
        rating: item.rating?.rate || 4.5,
      }));
      set({ products: mapped, isLoadingProducts: false });
    } catch (e) {
      console.warn('Failed to fetch live products, falling back to dummy data', e);
      // Fallback
      const { FAKE_PRODUCTS } = require('@/constants/fakeData');
      set({ products: FAKE_PRODUCTS, isLoadingProducts: false });
    }
  },

  addToCart: (product) =>
    set((s) => {
      const existing = s.cart.find((c) => c.product.id === product.id);
      if (existing) {
        return {
          cart: s.cart.map((c) =>
            c.product.id === product.id
              ? { ...c, quantity: c.quantity + 1 }
              : c
          ),
        };
      }
      return { cart: [...s.cart, { product, quantity: 1 }] };
    }),

  removeFromCart: (productId) =>
    set((s) => ({
      cart: s.cart.filter((c) => c.product.id !== productId),
    })),

  updateQuantity: (productId, quantity) =>
    set((s) => {
      if (quantity <= 0) {
        return { cart: s.cart.filter((c) => c.product.id !== productId) };
      }
      return {
        cart: s.cart.map((c) =>
          c.product.id === productId ? { ...c, quantity } : c
        ),
      };
    }),

  clearCart: () => set({ cart: [] }),

  getCartCount: () =>
    get().cart.reduce((sum, c) => sum + c.quantity, 0),

  getCartTotal: () =>
    get().cart.reduce((sum, c) => sum + c.product.price * c.quantity, 0),

  toggleWishlist: (product) =>
    set((s) => {
      const exists = s.wishlist.find((w) => w.id === product.id);
      if (exists) {
        return { wishlist: s.wishlist.filter((w) => w.id !== product.id) };
      }
      return { wishlist: [...s.wishlist, product] };
    }),

  isInWishlist: (productId) =>
    !!get().wishlist.find((w) => w.id === productId),

  setProfile: (profile) =>
    set((s) => ({
      profile: { ...s.profile, ...profile },
    })),
}));
