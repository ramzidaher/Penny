# Database vs Cache Storage

This document provides a clear breakdown of what data is stored in the **Firestore Database** (cloud, synced across devices) versus what is stored in **Local Cache** (device-specific, encrypted).

---

## 📊 Overview

| Storage Type | Location | Cross-Device Sync | Encryption | Purpose |
|--------------|----------|-------------------|------------|---------|
| **Firestore Database** | Cloud (Firebase) | ✅ Yes | ✅ Yes (Firestore encryption) | Non-sensitive metadata & user-created data |
| **Local Cache** | Device (SecureStore/AsyncStorage) | ❌ No | ✅ Yes (Hardware-backed) | Sensitive financial data & tokens |

---

## 🗄️ Firestore Database (Cloud Storage)

**Purpose:** Store non-sensitive metadata and user-created data that should be available across all devices.

### ✅ What's Stored in Firestore

#### 1. **Accounts** (Metadata Only)
```typescript
{
  id: string;
  name: string;                    // Account display name
  type: 'bank' | 'card' | 'cash' | 'investment';
  currency: string;                // Currency code (GBP, USD, etc.)
  balance: 0;                      // ⚠️ PLACEHOLDER ONLY - actual balance NOT stored
  // Card-specific fields
  linkedAccountId?: string;        // For cards linked to bank accounts
  cardNumber?: string;             // Full card number (encrypted in Firestore)
  cardPin?: string;                // Last 4 digits (for display)
  cardLogo?: string;               // Bank/issuer name
  // TrueLayer-specific metadata
  truelayerConnectionId?: string;  // Connection identifier
  truelayerAccountId?: string;     // TrueLayer account identifier
  isSynced?: boolean;              // Whether synced from TrueLayer
  lastSyncedAt?: string;           // Last sync timestamp
  truelayerAccountType?: string;   // Account type from TrueLayer
  createdAt: string;
  updatedAt: string;
}
```

**Why in Cloud:**
- Non-sensitive metadata needed for account identification
- Required for cross-device functionality
- Account list should be available on all devices

**What's NOT Stored:**
- ❌ Actual account balances (fetched on-demand from TrueLayer API)
- ❌ Transaction data from TrueLayer (cached locally only)

---

#### 2. **Manual Transactions** (User-Created)
```typescript
{
  id: string;
  accountId: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: string;
  createdAt: string;
  subscriptionId?: string;         // Link to subscription
  debtId?: string;                 // Link to debt
  budgetId?: string;               // Link to budget
  descriptionHash?: string;        // SHA-256 hash for GDPR compliance
  truelayerTransactionId?: string; // If synced from TrueLayer
}
```

**Why in Cloud:**
- User explicitly created these transactions
- Should be available on all devices
- User categorizations and tags need to persist

**Note:** TrueLayer-synced transactions are NOT stored in Firestore by default. They are cached locally. However, if a user edits/categorizes a TrueLayer transaction, those updates are stored in Firestore and merged with cached data.

---

#### 3. **Budgets**
```typescript
{
  id: string;
  category: string;
  limit: number;
  period: 'weekly' | 'monthly' | 'yearly';
  currentSpent: number;
  createdAt: string;
  updatedAt: string;
}
```

**Why in Cloud:**
- User-created financial planning data
- Should sync across devices

---

#### 4. **Subscriptions**
```typescript
{
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: 'monthly' | 'yearly' | 'weekly';
  nextBillingDate: string;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}
```

**Why in Cloud:**
- User-created subscription tracking
- Should sync across devices

---

#### 5. **Debts**
```typescript
{
  id: string;
  name: string;
  description: string;
  totalAmount: number;
  remainingAmount: number;
  interestRate?: number;
  minimumPayment?: number;
  dueDate: string;
  accountId?: string;
  budgetCategory?: string;
  type: 'loan' | 'credit_card' | 'buy_now_pay_later' | 'personal' | 'other';
  status: 'active' | 'paid_off' | 'overdue';
  createdAt: string;
  updatedAt: string;
}
```

**Why in Cloud:**
- User-created debt tracking
- Should sync across devices

---

#### 6. **Chat Threads** (AI Conversations)
```typescript
{
  id: string;
  title: string;                   // First message or user-provided title
  messages: ChatMessage[];          // Array of chat messages
  createdAt: string;
  updatedAt: string;
}
```

**Why in Cloud:**
- User conversations should be available on all devices
- Part of user's app experience

---

#### 7. **Settings** (User Preferences)
```typescript
{
  id: string;
  userId: string;
  defaultCurrency: string;
  lowBalanceThreshold: number;
  enableLowBalanceAlerts: boolean;
  enableDailyReminders: boolean;
  dailyReminderTime: string;
  enableSubscriptionReminders: boolean;
  subscriptionReminderDays: number[];
  enableBudgetAlerts: boolean;
  budgetAlertThresholds: number[];
  enableNotifications: boolean;
  enableSound: boolean;
  enableBadge: boolean;
  enableBiometric: boolean;
  aiTone: 'friendly' | 'professional' | 'direct' | 'harsh';
  swipeDirection: 'right-income-left-expense' | 'right-expense-left-income';
  theme: 'light' | 'dark' | 'auto';
  createdAt: string;
  updatedAt: string;
}
```

**Why in Cloud:**
- User preferences should sync across devices
- Settings are non-sensitive configuration data

---

## 💾 Local Cache (SecureStore/AsyncStorage)

**Purpose:** Encrypted local caching for sensitive financial data that should NOT be stored in the cloud.

### ✅ What's Stored in Cache

#### 1. **TrueLayer Tokens** (SecureStore - Device Keychain)
```typescript
{
  id: "tl_1234567890_abc123",
  accessToken: "encrypted_access_token",
  refreshToken: "encrypted_refresh_token",
  expiresAt: 1234567890000,
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

**Storage Details:**
- **Location:** Device keychain/keystore (most secure)
- **Encryption:** Hardware-backed encryption (iOS Keychain, Android Keystore)
- **TTL:** Based on token expiration (auto-refreshed)
- **Why Local:** Cannot be synced (security requirement - tokens are device-specific)

**Cache Key Format:**
- `tl_token_${userId}_${connectionId}`

---

#### 2. **Transaction Cache** (SecureStore/AsyncStorage)
```typescript
{
  transactions: Transaction[],
  metadata: {
    userId: "user123",
    connectionId: "tl_123...",
    accountId: "acc_456...",
    expiresAt: 1234567890000,
    cachedAt: 1234567890000,
    transactionCount: 150
  }
}
```

**Storage Details:**
- **Location:** SecureStore (if <2KB) or AsyncStorage (if >2KB)
- **Encryption:** SecureStore uses hardware-backed encryption, AsyncStorage uses app-level encryption
- **TTL:** 6 hours (transactions change less frequently)
- **Why Local:** Security rule - "Do not persist raw financial data in cloud"

**Cache Key Format:**
- Data: `tx_cache_${userId}_${connectionId}_${accountId}`
- Metadata: `tx_meta_${userId}_${connectionId}_${accountId}`

**What's Cached:**
- All transactions fetched from TrueLayer API
- Includes both settled and pending transactions
- Automatically refreshed when cache expires or on manual refresh

**Note:** User categorizations/edits to transactions are stored in Firestore and merged with cached data when displaying.

---

#### 3. **Balance Cache** (SecureStore/AsyncStorage)
```typescript
{
  balance: 1234.56,
  currency: "GBP",
  metadata: {
    userId: "user123",
    connectionId: "tl_123...",
    accountId: "acc_456...",
    expiresAt: 1234567890000,
    cachedAt: 1234567890000
  }
}
```

**Storage Details:**
- **Location:** SecureStore (if <2KB) or AsyncStorage (if >2KB)
- **Encryption:** SecureStore uses hardware-backed encryption, AsyncStorage uses app-level encryption
- **TTL:** 30 minutes (balances change more frequently than transactions)
- **Why Local:** Security rule - "Do not persist raw financial data in cloud"

**Cache Key Format:**
- Data: `balance_cache_${userId}_${connectionId}_${accountId}`
- Metadata: `balance_meta_${userId}_${connectionId}_${accountId}`

**What's Cached:**
- Current account balance from TrueLayer API
- Available balance (if different from current)
- Currency information

**Note:** TrueLayer account balances are NEVER stored in Firestore. They are always fetched on-demand from the API and cached locally.

---

## 🔄 Data Flow

### TrueLayer Account Data Flow

```
TrueLayer API
    ↓
Fetch Account Metadata → Store in Firestore (metadata only)
    ↓
Fetch Balance → Cache Locally (30 min TTL)
    ↓
Fetch Transactions → Cache Locally (6 hour TTL)
```

### Manual Transaction Flow

```
User Creates Transaction
    ↓
Store in Firestore (immediately)
    ↓
Available on all devices
```

### Transaction Merging (TrueLayer + User Edits)

```
1. Fetch from Cache (TrueLayer transactions)
2. Fetch from Firestore (user categorizations/edits)
3. Merge: Use Firestore version if exists (has user updates)
4. Display merged result
```

---

## 🔐 Security Principles

### Why Some Data is Local Only

1. **Security Rule:** "Do not persist raw financial data unless strictly required"
2. **GDPR Compliance:** Minimal data retention with TTL-based expiration
3. **Token Security:** Tokens cannot be synced (device keychain requirement)
4. **Maximum Security:** Encrypted on-device only, never in cloud

### Encryption Details

| Storage Type | Encryption Method | Security Level |
|--------------|------------------|----------------|
| **Firestore** | Firestore encryption at rest | ✅ High |
| **SecureStore** | Hardware-backed (Keychain/Keystore) | ✅✅ Highest |
| **AsyncStorage** | App-level encryption | ✅ Medium |

---

## 📱 Cross-Device Behavior

### ✅ Available on All Devices (Firestore)
- Account metadata (name, type, currency)
- Manual transactions
- Budgets, subscriptions, debts
- Chat threads
- Settings and preferences

### ❌ Device-Specific (Local Cache)
- TrueLayer tokens (requires re-authentication on new device)
- Transaction cache (requires re-sync on new device)
- Balance cache (requires re-sync on new device)

### User Experience on New Device

1. User logs in → Sees accounts (from Firestore)
2. Accounts show "Reconnect" badge → Indicates sync needed
3. User taps "Connect Bank" → Re-authenticates with TrueLayer
4. Fresh data fetched → Transactions and balances synced
5. Data cached locally → Available on this device going forward

---

## ⏱️ Cache TTL (Time To Live)

| Data Type | TTL | Reason |
|-----------|-----|--------|
| **Transactions** | 6 hours | Change less frequently |
| **Balances** | 30 minutes | Change more frequently |
| **Tokens** | Based on expiration | Auto-refreshed when expired |

### Stale-While-Revalidate Pattern

- Returns cached data immediately (instant UX)
- Checks if cache is stale (>50% of TTL)
- If stale, refreshes in background (non-blocking)
- Updates cache when refresh completes

---

## 🧹 Cache Cleanup

### When Cache is Cleared

1. **On Logout:** All caches cleared
2. **On Token Revocation:** Connection-specific caches cleared
3. **On Cache Expiration:** Automatically deleted when TTL expires
4. **On User Mismatch:** Security check clears cache if userId doesn't match

### Manual Cache Management

- Pull-to-refresh forces immediate cache refresh
- Cache automatically expires based on TTL
- No manual cache clearing needed (handled automatically)

---

## 📊 Summary Table

| Data Type | Storage Location | Cross-Device? | Encrypted? | TTL |
|-----------|-----------------|---------------|------------|-----|
| Account Metadata | Firestore | ✅ Yes | ✅ Yes | N/A |
| Manual Transactions | Firestore | ✅ Yes | ✅ Yes | N/A |
| TrueLayer Transactions | Local Cache | ❌ No | ✅ Yes | 6 hours |
| Account Balances | Local Cache | ❌ No | ✅ Yes | 30 minutes |
| TrueLayer Tokens | SecureStore | ❌ No | ✅✅ Yes | Token expiration |
| Budgets | Firestore | ✅ Yes | ✅ Yes | N/A |
| Subscriptions | Firestore | ✅ Yes | ✅ Yes | N/A |
| Debts | Firestore | ✅ Yes | ✅ Yes | N/A |
| Chat Threads | Firestore | ✅ Yes | ✅ Yes | N/A |
| Settings | Firestore | ✅ Yes | ✅ Yes | N/A |

---

## 🔍 Key Takeaways

1. **Firestore (Cloud):** Non-sensitive metadata and user-created data that should sync across devices
2. **Local Cache:** Sensitive financial data (transactions, balances) and tokens that should NOT be in cloud
3. **Security First:** No raw financial data persisted in cloud (follows security rules)
4. **Performance:** Instant loading from cache with background updates
5. **GDPR Compliant:** TTL-based expiration minimizes data retention

---

**Last Updated:** 2024-01-01  
**Version:** 1.0.0




