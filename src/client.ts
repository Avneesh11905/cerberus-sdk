import axios, { AxiosInstance } from 'axios';
import { CerberusConfig, TokenResponse, User } from './types';
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';

export class CerberusClient {
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private csrfToken: string | null = null;
  private tokenListeners = new Set<(token: string | null) => void>();
  
  private currentUser: User | null = null;
  private userPromise: Promise<User | null> | null = null;
  public auth: AuthModule;
  public users: UsersModule;

  constructor(config: CerberusConfig) {
    if (!config.baseUrl) {
      throw new Error("CerberusClient requires a 'baseUrl'");
    }
    if (!config.apiKey) {
      throw new Error("CerberusClient requires an 'apiKey'");
    }

    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
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

    // Handle global errors and silent token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (!originalRequest) {
          throw error;
        }

        if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh' && originalRequest.url !== '/auth/login/local') {
          if (isRefreshing) {
            return new Promise<string | null>(function(resolve, reject) {
              failedQueue.push({ resolve, reject });
            }).then(token => {
              originalRequest.headers = originalRequest.headers ?? {};
              originalRequest.headers.Authorization = 'Bearer ' + token;
              return axiosInstance(originalRequest);
            }).catch(err => {
              return Promise.reject(err);
            });
          }

          originalRequest._retry = true;
          isRefreshing = true;

          try {
            const response = await axiosInstance.post<TokenResponse>('/auth/refresh');
            const token = response.data.access_token;
            if (response.data.csrf_token) {
              this.setCsrfToken(response.data.csrf_token);
            }
            
            this.setAccessToken(token);
            axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            processQueue(null, token);
            
            return axiosInstance(originalRequest);
          } catch (refreshError) {
            processQueue(refreshError, null);
            // Don't throw a generic error here; clear headers and return rejection
            this.setAccessToken(null);
            delete axiosInstance.defaults.headers.common['Authorization'];
            return Promise.reject(refreshError);
          } finally {
            isRefreshing = false;
          }
        }

        if (error.response && error.response.data) {
          const detail = error.response.data.detail;
          if (typeof detail === 'string') {
            throw new Error(detail);
          }
        }
        throw error;
      }
    );

    this.auth = new AuthModule(this.axiosInstance, config.apiKey, (token) => this.setCsrfToken(token), this);
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
   *
   * After a successful OAuth login your frontend receives a redirect to
   * `<your-app>/auth/callback?code=<code>&new_user=<bool>`. Call this method
   * from that page to complete the flow:
   *
   * ```ts
   * const { isNewUser } = await cerberus.exchangeOAuthCode(code);
   * // You are now fully logged in!
   * ```
   *
   * Internally this calls POST /auth/exchange, which:
   *   1. Validates and consumes the one-time code
   *   2. Sets the HttpOnly refresh_token cookie on cerberus-api
   *   3. Returns the csrf_token in the response body
   *
   * The returned CSRF token is stored in memory and automatically attached as
   * the X-CSRF header on all subsequent requests. The SDK then automatically
   * fetches your initial access token and user profile.
   */
  async exchangeOAuthCode(code: string): Promise<{ isNewUser: boolean }> {
    const response = await this.axiosInstance.post<{ is_new_user: boolean; csrf_token: string }>(
      '/auth/exchange',
      { code },
    );
    // Store the CSRF token in memory
    this.csrfToken = response.data.csrf_token;
    
    // Automatically fetch the initial access token
    await this.refreshAccessToken();

    // Asynchronously fetch the user to update cache
    this.users.getMe(true).catch(() => {});
    
    return { isNewUser: response.data.is_new_user };
  }
}
