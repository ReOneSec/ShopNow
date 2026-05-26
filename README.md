# ShopNow (StealthChat) 🕵️‍♂️🛍️

Welcome to **ShopNow**, an application that perfectly disguises a highly secure, real-time encrypted messaging and media vault application behind a fully functional (dummy) e-commerce storefront.

## What is this?

To the untrained eye, **ShopNow** is a beautiful, fully-featured e-commerce app built with React Native and Expo. It has a home page, product listings, a working shopping cart, a multi-step checkout flow, and pulls live product data from `fakestoreapi.com`. 

However, hidden underneath this innocent facade is a complete stealth communication platform powered by Supabase.

---

## 🔑 How to Access the Secret Chat

The chat app is completely hidden from the normal UI. There are no obvious login buttons. 

Here is how you can access the Stealth Chat login screen:

1. Open the app to the main **ShopNow** home screen.
2. Locate the **Customer Support (Headset) icon** in the top right corner of the header.
3. Rapidly tap the Customer Support icon **10 times in a row**.
4. You will feel a haptic success vibration, and the hidden **Stealth Login** screen will appear.
5. Create a new stealth account or log in to your existing one.

*Note: You can configure the exact tap count and other security settings once you are inside the stealth app's settings menu.*

---

## Extensive Feature List ✨

### The Disguise (E-Commerce Layer)
- **Live Products API**: Fetches real dummy products from `fakestoreapi.com`, ensuring the inventory looks realistic and dynamic, giving the disguise perfect credibility.
- **Shopping Cart & Checkout**: Fully functional local cart state (via Zustand) and a dummy multi-step checkout flow (Address -> Payment -> Confirmation).
- **Premium UI & Micro-Animations**: Smooth scale-on-press animations via `react-native-reanimated`, shimmering skeleton loaders while products fetch, and high-quality vector icons using `lucide-react-native`.
- **Inactivity Timeout**: If the app is sent to the background, it instantly kicks you out of the chat layer and resets to the shopping home screen to protect your privacy.

### The Core (Stealth Chat & Vault)
- **Real-Time Messaging**: iMessage-style chat interface with real-time syncing via Supabase Channels.
- **Media & Voice Notes**: Send photos, videos, and high-quality voice notes directly in chat.
- **Encrypted Media Vault**: Store sensitive photos and videos in a secure vault hidden behind a PIN or biometric lock (Face ID / Touch ID).
- **Ephemeral Messages 🔥**: Send "Fire" messages that automatically self-destruct from the UI 10 seconds after rendering.
- **Panic Delete**: Instantly wipe an entire conversation (for both sender and receiver) with a single long-press on the trash icon.
- **Sensor Lock (Shake-to-Lock)**: Integrated with `expo-sensors`. If you are inside the chat layer and someone approaches, simply **shake your phone** or put it **face down**, and the app will instantly lock and return to the shopping disguise.
- **Duress PIN**: Configure a Duress PIN in the Settings menu (default `0000`). If forced to open your vault, entering the Duress PIN will open a completely empty, dummy vault.
- **AES Encrypted Sessions**: To bypass the `SecureStore` 2048-byte limit, Supabase session tokens are symmetrically encrypted locally using AES (`crypto-js`) and stored securely in `AsyncStorage`.

---

## Project Structure 📁

```text
ShopNow/
├── app/
│   ├── (auth)/         # Stealth login and registration
│   ├── (app)/          # The hidden stealth layer (Chats, Settings, Vault)
│   ├── (disguise)/     # The dummy e-commerce shopping layer
│   └── _layout.tsx     # Root layout determining which layer to show
├── components/
│   ├── disguise/       # Dummy UI components (SensorLock, etc.)
│   └── ui/             # Reusable core UI components (AppIcon, AnimatedBubble)
├── constants/
│   ├── theme.ts        # Global colors, typography, spacing, shadows
│   ├── fakeData.ts     # Fallback dummy data for the shop
│   └── config.ts       # Global config limits and constants
├── services/
│   └── supabase/       # Supabase client with AES encrypted storage adapter
├── store/
│   ├── authStore.ts    # Authentication state
│   ├── chatStore.ts    # Real-time messages state
│   └── shopStore.ts    # Dummy shop cart & wishlist state
└── types/
    └── database.ts     # Supabase auto-generated database types
```

---

## Getting Started (Development)

### Prerequisites
- Node.js (v18+)
- Expo CLI
- A Supabase Project (URL and Anon Key)

### Installation

1. **Clone the repository** (or download the source):
   ```bash
   git clone <repo-url>
   cd ShopNow
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the Expo Development Server**:
   ```bash
   npx expo start
   ```
   *If you are running on a physical device, make sure to install the Expo Go app.*

---

## Supabase Database Setup 🗄️

To run this project fully, your Supabase project must be configured with the correct tables, storage buckets, and RPC functions.

### Core Tables Needed:
- `users`: Stores user profiles, aliases, online status.
- `conversations` & `conversation_members`: Manages chat rooms and participants.
- `messages`: Stores chat messages (text, image, voice, gif).
- `vault_items`: Stores URLs and metadata for files hidden in the vault.
- `settings`: User-specific security settings (Disguise timeout, tap limit, etc.).
- `friendships` & `friend_requests`: Manages connections between stealth users.

### Storage Buckets Needed:
- `avatars`: For user profile pictures.
- `media`: For chat attachments (images, voice notes).
- `vault`: For private media stored in the vault.

*(The `types/database.ts` file acts as the ultimate schema reference if you need to recreate the exact table columns.)*

---

## Tech Stack
- **Framework**: React Native + Expo Router
- **Backend & Realtime**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **State Management**: Zustand
- **Animations**: React Native Reanimated
- **Icons**: Lucide React Native
- **Sensors**: Expo Sensors (Accelerometer for shake detection)
- **Security**: CryptoJS (AES Encryption), Expo SecureStore, Expo LocalAuthentication (Biometrics)

## Disclaimer
This application is designed as a privacy tool and a proof-of-concept for hidden UI patterns. Please use it responsibly.
