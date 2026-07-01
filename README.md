<div align="center">

<img src="https://cerberus.aymahajan.in/logo.webp" alt="Cerberus Logo" width="80" />

# `@cerberus/sdk`

**The official JavaScript / TypeScript frontend SDK for the Cerberus Identity Platform.**

Integrate production-ready authentication into any frontend — React, Vue, Next.js, Svelte, or Vanilla JS — in minutes.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Axios](https://img.shields.io/badge/Axios-1.7-5A29E4?style=flat-square&logo=axios&logoColor=white)](https://axios-http.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

[📖 Interactive Docs](https://cerberus.aymahajan.in/docs/sdk) · [🏠 Main Repository](https://github.com/Avneesh11905/cerberus) · [🐛 Report a Bug](https://github.com/Avneesh11905/cerberus-sdk/issues)

</div>

---

> **Looking for the backend?** This is the frontend SDK only. The core Auth-as-a-Service engine and the Global Admin Dashboard live in the main repository: **[Avneesh11905/cerberus](https://github.com/Avneesh11905/cerberus)**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔄 **Silent Token Refresh** | Automatically intercepts `401` responses, refreshes the Access Token, and retries the original request — transparently. |
| 🔒 **HttpOnly Cookie Security** | Pre-configured with `withCredentials: true` for secure cross-origin session cookies. |
| 🏷️ **Project Scoping** | Automatically injects your `X-Cerberus-API-Key` header into every request. |
| 🧠 **Built-in State Caching** | User profiles are cached in memory and auto-invalidated on updates. |
| 🌐 **OAuth Ready** | First-class support for Google, GitHub, and any OAuth 2.0 provider configured in your dashboard. |
| 🔷 **End-to-End Type Safety** | Fully typed with TypeScript — requests, responses, and errors. |
| ⚡ **Zero Race Conditions** | An advanced interceptor queue prevents concurrent token refresh collisions. |

---

## 📋 Prerequisites: Dashboard Setup

Before using the SDK, set up your project in the [Cerberus Dashboard](https://cerberus.aymahajan.in/dashboard):

1. **Create a Project** — Go to your Dashboard and click **"New Project"**. Projects logically isolate your users and configuration.
2. **Add Allowed Origins** — In your project's settings, add every URL your frontend will run on (e.g., `http://localhost:3000`, `https://your-app.com`). This is required for the browser to accept cross-origin auth cookies.
3. **Copy your Project API Key** — From the **"Access Keys & Secrets"** tab, copy your `cerb_live_...` key. This is your `apiKey` for SDK initialization.

> [!IMPORTANT]
> Your Allowed Origins must match your frontend URL **exactly** (including the port). A mismatch is the #1 cause of authentication failures.

---

## 🚀 Installation

Install directly from GitHub using npm or pnpm:

```bash
# npm
npm install github:Avneesh11905/cerberus-sdk#main

# pnpm
pnpm add github:Avneesh11905/cerberus-sdk#main
```

> The package includes a `prepare` script that automatically compiles TypeScript on install. No extra build step needed.

---

## 💻 Initialization

Create the client **once** and export it. Import this instance anywhere in your app.

```typescript
// src/lib/cerberus.ts
import { CerberusClient } from '@cerberus/sdk';

export const cerberus = new CerberusClient({
  baseUrl: 'https://cerberus-api.aymahajan.in', // The Cerberus Authentication URL
  apiKey:  'cerb_live_XXXXXXXXXX',              // Your Project API Key from the Dashboard
});
```

| Option | Type | Description |
|---|---|---|
| `baseUrl` | `string` | The URL of the Cerberus authentication backend. |
| `apiKey` | `string` | Your project's public API key (`cerb_live_...`). |

---

## 📚 API Reference

### 🔐 `cerberus.auth` — Authentication

#### Register & Email Verification

Registration is a two-step flow to verify email ownership. A 6-digit OTP is sent to the user's inbox after `register()`.

```typescript
// Step 1 — Create the account
await cerberus.auth.register({
  email:    'user@example.com',
  password: 'StrongPassword123!',
  name:     'Jane Doe',          // Optional
});

// Step 2 — Verify with the OTP from email
await cerberus.auth.verifyEmail({
  email: 'user@example.com',
  otp:   '123456',
});

// Resend a new OTP if the first one expired
await cerberus.auth.resendVerification({ email: 'user@example.com' });
```

| Method | Returns |
|---|---|
| `auth.register(data)` | `Promise<MessageResponse>` |
| `auth.verifyEmail(data)` | `Promise<MessageResponse>` |
| `auth.resendVerification(data)` | `Promise<MessageResponse>` |

---

#### Email / Password Login

```typescript
await cerberus.auth.login({
  email:    'user@example.com',
  password: 'StrongPassword123!',
});
// The user is now authenticated. The SDK stores the JWT in memory
// and the HttpOnly refresh cookie is set by the browser automatically.
```

| Method | Returns |
|---|---|
| `auth.login(credentials)` | `Promise<LoginResponse>` |

---

#### OAuth Login

Two calls handle the entire OAuth flow — one to start it, one to finish it.

```typescript
// 1. Attach to your "Login with Google" button
await cerberus.auth.initiateOAuthLogin('google'); // Redirects the browser

// 2. Call this on your callback/landing page (reads the code from the URL automatically)
const result = await cerberus.auth.handleOAuthCallback();
if (result) {
  console.log('Logged in!', result.user, 'New user?', result.isNewUser);
}
```

| Method | Returns |
|---|---|
| `auth.initiateOAuthLogin(provider)` | `Promise<void>` (redirects) |
| `auth.handleOAuthCallback()` | `Promise<{ user: User, isNewUser: boolean } \| null>` |

---

#### Session Management

```typescript
await cerberus.auth.logout();                           // Log out current device
await cerberus.auth.logoutAll();                        // Revoke ALL sessions across all devices
const sessions = await cerberus.auth.listSessions();    // List all active sessions
await cerberus.auth.revokeSession('family-uuid-here');  // Revoke a specific device
```

| Method | Returns |
|---|---|
| `auth.logout()` | `Promise<MessageResponse>` |
| `auth.logoutAll()` | `Promise<MessageResponse>` |
| `auth.listSessions()` | `Promise<Session[]>` |
| `auth.revokeSession(familyId)` | `Promise<void>` |

---

### 👤 `cerberus.users` — User Management

The SDK maintains an internal cache of the user profile. It is automatically populated on login and invalidated on updates.

```typescript
// Fetch the current user (served from cache if available)
const user = await cerberus.users.getMe();

// Force a fresh fetch from the server (bypasses cache)
const freshUser = await cerberus.users.getMe(true);

// Update profile fields (cache is auto-synced)
const updated = await cerberus.users.updateMe({
  name:            'Jane Doe',
  picture:         'https://example.com/avatar.png',
  receive_updates: false,
});

// Soft-delete the account and revoke all sessions
await cerberus.users.deleteMe();
```

| Method | Returns |
|---|---|
| `users.getMe(forceFetch?)` | `Promise<User>` |
| `users.updateMe(data)` | `Promise<User>` |
| `users.deleteMe()` | `Promise<void>` |

---

## 🧠 How Silent Token Refresh Works

The `CerberusClient` uses an Axios interceptor with a request queue to handle token expiry without any manual intervention:

```
Your Request ──► API (401: Token Expired)
                     │
                     ▼
            ┌────────────────────┐
            │  Pause all other   │
            │  pending requests  │
            └────────────────────┘
                     │
                     ▼
            POST /auth/refresh  ◄── HttpOnly Cookie (auto-sent by browser)
                     │
              ┌──────┴──────┐
              │  New JWT    │
              └──────┬──────┘
                     │
                     ▼
            ┌────────────────────┐
            │  Replay all paused │
            │  requests with new │
            │  token injected    │
            └────────────────────┘
```

This eliminates race conditions where multiple concurrent requests each independently attempt a refresh.

---

## 🛡️ Protecting Routes (React Example)

#### 1. Create an Auth Context

```tsx
// src/lib/auth.tsx
import { useState, useEffect, createContext, useContext } from 'react';
import { cerberus } from './cerberus';
import type { User } from '@cerberus/sdk';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    cerberus.users.getMe()
      .then(setUser)
      .catch(() => setUser(null)) // 401 = not logged in
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

#### 2. Protect Private Routes

```tsx
// Redirect unauthenticated users to /login
export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
```

#### 3. Block Authenticated Users from Guest Pages

```tsx
// Redirect already-logged-in users away from /login and /register
export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}
```

---

## 🔷 TypeScript Types

```typescript
interface User {
  id:              string;
  email:           string;
  role:            'user' | 'tenant' | 'admin';
  is_active:       boolean;
  created_at:      string;
  updated_at?:     string;
  project_id?:     string;
  name?:           string;
  picture?:        string;
  receive_updates?: boolean;
  login_methods?:  string[];
}

interface Session {
  family_id:     string;
  ip_address:    string | null;
  user_agent:    string | null;
  created_at:    string;
  last_active:   string;
  is_current:    boolean;
  auth_provider: string;
}

interface MessageResponse { message: string; }
interface LoginResponse   { message: string; csrf_token: string; }
```

---

## 🩺 Troubleshooting

**`getMe()` always returns `401` even after a successful login**

The browser is blocking cross-origin cookies. Check the following:

- **Allowed Origins:** Make sure your frontend URL (e.g. `http://localhost:3000`) is added **exactly** in your project's Allowed Origins in the Cerberus Dashboard. A missing port or trailing slash will cause a mismatch.
- **HTTPS:** Browsers block `SameSite=None` cookies on plain HTTP between different origins. Use HTTPS in staging and production, or keep both frontend and API on the same localhost.
- **Browser Extensions:** Privacy-focused extensions (uBlock, Brave Shields) can block third-party cookies. Test in a clean browser profile.

---

## 📄 License

MIT © [Avneesh Mahajan](https://github.com/Avneesh11905)
