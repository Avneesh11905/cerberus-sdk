<div align="center">

<img src="  " alt="Cerberus Logo" width="80" />

# `@cerberus/sdk`

**The official JavaScript / TypeScript frontend SDK for the Cerberus Identity Platform.**

Integrate production-ready authentication into any frontend — React, Vue, Next.js, Svelte, or Vanilla JS — in minutes.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Axios](https://img.shields.io/badge/Axios-1.7-5A29E4?style=flat-square&logo=axios&logoColor=white)](https://axios-http.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

[📖 Interactive Docs](https://cerberus.aymahajan.in/docs/sdk) · [🏠 Main Repository](https://github.com/Avneesh11905/cerberus) · [🐛 Report a Bug](https://github.com/Avneesh11905/cerberus-sdk/issues)

</div>

---

> **Looking for the backend?** This is the frontend SDK only. The core Auth-as-a-Service engine and the Dashboard live in the main repository: **[Avneesh11905/cerberus](https://github.com/Avneesh11905/cerberus)**.
> 
> ⚠️ **SSR Warning:** This SDK maintains state internally. Do **not** use `CerberusClient` as a global singleton in Server-Side Rendering (SSR) environments like Next.js, Nuxt, or SvelteKit, as it will cause authentication state to bleed across different users' requests. Instantiate it per-request or strictly in client-side code.

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

Before using the SDK, set up your project in the [Cerberus Dashboard](https://cerberus.aymahajan.in):

1. **Sign Up / Log In** — Create an account and log in to access your Dashboard.
2. **Create a Project** — From your Dashboard, click **"New Project"**. Projects logically isolate your users and configuration.
3. **Add Allowed Origins** — In your project's settings, add every URL your frontend will run on (e.g., `http://localhost:3000`, `https://your-app.com`). This is required for the browser to accept cross-origin auth cookies.
4. **Copy your Project API Key** — From the **"Access Keys & Secrets"** tab, copy your `cerb_...` key. This is your `apiKey` for SDK initialization.

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
  apiKey:  'cerb_XXXXXXXXXX', // Your Project API Key from the Dashboard
  // baseUrl: 'https://...',     // Optional: Only needed if you are self-hosting the backend
});
```

| Option | Type | Description |
|---|---|---|
| `baseUrl` | `string?` | **Optional**. The URL of your backend. Defaults to the Cerberus Cloud (`https://cerberus-api.aymahajan.in`). |
| `apiKey` | `string` | **Required**. Your project's public API key (`cerb_...`). |

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

#### Password Management

```typescript
// Request a password reset email
await cerberus.auth.requestPasswordReset('user@domain.com');

// Execute a password reset using the token from the email
await cerberus.auth.executePasswordReset('reset-token-123', 'new_secure_password123!');

// Change the password for an authenticated user
await cerberus.auth.changePassword({
  current_password: 'old_password',
  new_password: 'new_secure_password123!'
});
```

| Method | Returns |
|---|---|
| `auth.requestPasswordReset(email)` | `Promise<MessageResponse>` |
| `auth.executePasswordReset(token, new_password)` | `Promise<MessageResponse>` |
| `auth.changePassword(data)` | `Promise<MessageResponse>` |

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

### ⚙️ Interceptors & Token Subscribers

If you are using your own API client to talk to your proprietary backend, or if you need to manually bind the SDK state to React, you can use these helpers:

```typescript
// 1. Sync SDK Token state with React/Vue
const unsubscribe = cerberus.onTokenChange((newToken) => {
  // Triggered on login, logout, and background silent refreshes
  console.log("Token is now:", newToken); 
});

// 2. Attach Cerberus logic to your own Axios instance
const myBackendApi = axios.create({ baseURL: 'https://api.mycoolapp.com' });
cerberus.attachInterceptor(myBackendApi);
// myBackendApi will now automatically inject Bearer tokens and retry on 401s!

// 3. Manually get a token (auto-refreshes if expiring within 30s)
const token = await cerberus.getToken();
```

| Method | Returns |
|---|---|
| `cerberus.onTokenChange(listener)` | `() => void` (Unsubscribe function) |
| `cerberus.attachInterceptor(axios)`| `void` |
| `cerberus.getToken()` | `Promise<string \| null>` |

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

interface MessageResponse {
  message: string;
}

interface LoginResponse {
  message: string;
  csrf_token: string;
  access_token: string;
  user: User;
}
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
