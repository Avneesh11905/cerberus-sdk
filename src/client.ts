/**
 * @fileoverview Core client for the Cerberus SDK.
 * Defines the CerberusClient class which manages API configuration, 
 * token rotation (access tokens & CSRF), Axios interceptors, 
 * and provides access to sub-modules like Auth and Users.
 */

import axios, { AxiosInstance } from 'axios';
import { CerberusConfig, ExchangeResponse, TokenResponse, User } from './types';
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';

export class CerberusClient {
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private csrfToken: string | null = null;
  private tokenListeners = new Set<(token: string | null) => void>();
  public auth: AuthModule;
  public users: UsersModule;

  constructor(config: CerberusConfig) {
    if (!config.apiKey) {
      throw new Error("CerberusClient requires an 'apiKey'");
    }

    const baseUrl = config.baseUrl || 'https://cerberus-api.aymahajan.in';

    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      withCredentials: true, // Crucial for HttpOnly cookies
      headers: {
        'Content-Type': 'application/json',
        'X-Cerberus-API-Key': config.apiKey,
      },
    });

    const axiosInstance = this.axiosInstance;

    // Request interceptor — attach JWT and CSRF token.
    //
    // CSRF strategy:
    //   1. Prefer the in-memory csrfToken, which is set by exchangeOAuthCode()
    //      after the OAuth exchange call returns it in the response body. This is
    //      necessary for SDK consumers on foreign domains (e.g. myapp.com) who
    //      cannot read `document.cookie` for cookies scoped to cerberus-api.
    //   2. Fall back to reading `document.cookie` for same-site setups where the
    //      cookie is accessible (e.g. cerberus.aymahajan.in reading from
    //      .aymahajan.in scoped cookie — not used anymore, but kept as a fallback).
    this.axiosInstance.interceptors.request.use((config) => {
      if (this.csrfToken) {
        config.headers['X-CSRF'] = this.csrfToken;
      } else if (typeof document !== 'undefined') {
        const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
        if (match) {
          config.headers['X-CSRF'] = decodeURIComponent(match[1]);
        }
      }
      return config;
    });

    this.createAuthInterceptor(this.axiosInstance, true);

    this.auth = new AuthModule(this.axiosInstance, (token) => this.setCsrfToken(token), this);
    this.users = new UsersModule(this.axiosInstance, this);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    for (const listener of this.tokenListeners) {
      listener(token);
    }
  }

  onTokenChange(listener: (token: string | null) => void): () => void {
    this.tokenListeners.add(listener);
    return () => {
      this.tokenListeners.delete(listener);
    };
  }

  // --- User State Management --- //

  /** INTERNAL: Clear the current user (e.g. on logout) */
  clearUser(): void {
    this.users.clearCache();
  }

  setCsrfToken(token: string | null): void {
    this.csrfToken = token;
  }

  async refreshAccessToken(): Promise<string | null> {
    const response = await this.axiosInstance.post<TokenResponse>('/auth/refresh');
    const token = response.data.access_token ?? null;
    if (response.data.csrf_token) {
      this.setCsrfToken(response.data.csrf_token);
    }
    this.setAccessToken(token);
    if (token) {
      this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.axiosInstance.defaults.headers.common['Authorization'];
    }
    return token;
  }

  /**
   * Redeem a one-time OAuth exchange code for session cookies and an access token.
   */
  async exchangeOAuthCode(code: string): Promise<{ isNewUser: boolean; user: User; accessToken: string }> {
    const response = await this.axiosInstance.post<ExchangeResponse>(
      '/auth/exchange',
      { code },
    );
    // Store the CSRF token in memory
    this.csrfToken = response.data.csrf_token;

    // Set access token directly from response
    this.setAccessToken(response.data.access_token);
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;

    // Set user directly from response
    this.users.setUser(response.data.user);

    return {
      isNewUser: response.data.is_new_user,
      user: response.data.user,
      accessToken: response.data.access_token
    };
  }

  /**
   * Retrieves the current access token.
   * If the token is expired or expires within 30 seconds, it will automatically refresh it.
   */
  async getToken(): Promise<string | null> {
    if (!this.accessToken) {
      return null;
    }
    try {
      let base64 = this.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) {
        base64 += '='.repeat(4 - pad);
      }
      const payload = JSON.parse(atob(base64));
      if (payload?.exp && Math.floor(Date.now() / 1000) >= payload.exp - 30) {
        return await this.refreshAccessToken();
      }
    } catch {
      // Malformed token — return as-is; the server will reject it if expired.
    }
    return this.accessToken;
  }

  /**
   * Attaches Cerberus token rotation interceptors to your own Axios instance.
   * This automatically injects the Authorization header and seamlessly handles 
   * 401 retries by calling Cerberus /refresh internally.
   */
  attachInterceptor(clientInstance: AxiosInstance): void {
    // 1. Inject Token
    clientInstance.interceptors.request.use(async (config) => {
      // Do not block the request for getToken() if we don't even have an initial token,
      // just pass what we currently have in memory. The 401 interceptor will catch it if it's invalid.
      const token = this.accessToken;
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    // 2. Handle 401 retries
    this.createAuthInterceptor(clientInstance, false);
  }

  private createAuthInterceptor(client: AxiosInstance, isInternal: boolean) {
    let isRefreshing = false;
    let failedQueue: Array<{
      resolve: (token: string | null) => void;
      reject: (error: unknown) => void;
    }> = [];

    const processQueue = (error: any, token: string | null = null) => {
      failedQueue.forEach(prom => {
        if (error) {
          prom.reject(error);
        } else {
          prom.resolve(token);
        }
      });
      failedQueue = [];
    };

    client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (!originalRequest) return Promise.reject(error);

        const isAuthRoute = originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/login/local');

        if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
          if (isRefreshing) {
            return new Promise<string | null>(function (resolve, reject) {
              failedQueue.push({ resolve, reject });
            }).then(token => {
              originalRequest.headers = originalRequest.headers ?? {};
              originalRequest.headers['Authorization'] = `Bearer ${token}`;
              return client(originalRequest);
            }).catch(err => {
              return Promise.reject(err);
            });
          }

          originalRequest._retry = true;
          isRefreshing = true;

          try {
            const token = await this.refreshAccessToken();
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            processQueue(null, token);
            return client(originalRequest);
          } catch (refreshError) {
            processQueue(refreshError, null);
            if (isInternal) {
              this.setAccessToken(null);
              delete this.axiosInstance.defaults.headers.common['Authorization'];
            }
            return Promise.reject(refreshError);
          } finally {
            isRefreshing = false;
          }
        }

        if (isInternal && error.response && error.response.data) {
          const detail = error.response.data.detail;
          if (typeof detail === 'string') {
            throw new Error(detail);
          }
        }
        throw error;
      }
    );
  }
}

