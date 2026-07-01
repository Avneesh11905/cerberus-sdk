import { AxiosInstance } from 'axios';
import { MessageResponse, LoginResponse, Session } from '../types';
import type { CerberusClient } from '../client';

export class AuthModule {
  constructor(
    private client: AxiosInstance,
    private apiKey: string,
    private setCsrfToken?: (token: string) => void,
    private parentClient?: CerberusClient
  ) {}

  async register(data: { email: string; password: string; name?: string }): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>('/auth/register', data);
    return response.data;
  }

  async verifyEmail(data: { email: string; otp: string }): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>('/auth/verify-email', data);
    // Fetch user so cache is updated
    if (this.parentClient) {
      this.parentClient.users.getMe(true).catch(() => {});
    }
    return response.data;
  }

  async resendVerification(data: { email: string }): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>('/auth/verify-email/resend', data);
    return response.data;
  }

  async login(data: { email: string; password: string }): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login/local', {
      email: data.email,
      password: data.password,
    });
    if (this.setCsrfToken && response.data.csrf_token) {
      this.setCsrfToken(response.data.csrf_token);
    }
    if (this.parentClient) {
      this.parentClient.users.getMe(true).catch(() => {});
    }
    return response.data;
  }

  async logout(): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>('/auth/logout');
    if (this.parentClient) {
      this.parentClient.clearUser();
    }
    return response.data;
  }

  async logoutAll(): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>('/auth/logout/all');
    if (this.parentClient) {
      this.parentClient.clearUser();
    }
    return response.data;
  }

  /**
   * Initiate an OAuth login flow securely (preferred).
   *
   * Calls POST /auth/oauth/preflight/{provider} via Axios (API key goes in the
   * X-Cerberus-API-Key header, never in a URL), receives a redirect URL from the
   * server, and navigates the browser to it. The session cookie carries the project
   * context so no api_key query param appears in browser history.
   *
   * @param provider - The OAuth provider name, e.g. "google" or "github".
   */
  async initiateOAuthLogin(provider: string): Promise<void> {
    const response = await this.client.post<{ redirect_url: string }>(`/auth/oauth/preflight/${provider}`);
    const redirectUrl = response.data.redirect_url;
    if (typeof window !== 'undefined') {
      window.location.href = redirectUrl;
    }
  }

  /**
   * @deprecated Use initiateOAuthLogin(provider) instead.
   * Returns a URL with the api_key in the query string (appears in browser history).
   */
  getOAuthLoginUrl(provider: string): string {
    const url = new URL(`${this.client.defaults.baseURL}/auth/login/${provider}`);
    url.searchParams.append('api_key', this.apiKey);
    return url.toString();
  }

  /**
   * Helper utility for OAuth callback handling.
   * Automatically parses the `code` from the URL, exchanges it for a session,
   * cleans the URL to remove the code, and fetches the user profile.
   * 
   * If no `code` is found in the URL, this function safely does nothing and returns `null`.
   * This makes it safe to run on your global landing page or root component.
   */
  async handleOAuthCallback(): Promise<{ isNewUser: boolean } | null> {
    if (typeof window === 'undefined') {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      return null;
    }
    
    // Clean the URL so the code doesn't stick around in browser history
    params.delete('code');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
    window.history.replaceState({}, document.title, newUrl);

    if (!this.parentClient) {
      throw new Error('SDK Client is not fully initialized');
    }

    return this.parentClient.exchangeOAuthCode(code);
  }

  async changePassword(data: { current_password?: string; new_password: string }): Promise<MessageResponse> {
    const response = await this.client.patch<MessageResponse>('/auth/password', data);
    return response.data;
  }

  async requestPasswordReset(email: string): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>('/auth/password/forgot', { email });
    return response.data;
  }

  async executePasswordReset(token: string, new_password: string): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>('/auth/password/reset', { token, new_password });
    return response.data;
  }

  async listSessions(): Promise<Session[]> {
    const response = await this.client.get<Session[]>('/auth/sessions');
    return response.data;
  }

  async revokeSession(familyId: string): Promise<void> {
    await this.client.delete(`/auth/sessions/${familyId}`);
  }
}
