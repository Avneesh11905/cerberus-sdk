import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { CerberusClient } from '../client';

describe('CerberusClient', () => {
  let mock: MockAdapter;
  let client: CerberusClient;

  beforeAll(() => {
    // Initialize mock adapter
    mock = new MockAdapter(axios);
  });

  beforeEach(() => {
    mock.reset();
    client = new CerberusClient({
      baseUrl: 'http://localhost:8000',
      apiKey: 'test_api_key',
    });
    // Link the mock to the client's axios instance
    mock = new MockAdapter((client as any).axiosInstance);
  });

  afterAll(() => {
    mock.restore();
  });

  it('should initialize with correct headers and base URL', async () => {
    mock.onGet('/users/me').reply(config => {
      expect(config.baseURL).toBe('http://localhost:8000');
      expect(config.headers?.['X-Cerberus-API-Key']).toBe('test_api_key');
      expect(config.withCredentials).toBe(true);
      return [200, { id: '123', email: 'test@example.com', role: 'user' }];
    });

    const user = await client.users.getMe();
    expect(user!.id).toBe('123');
    expect(user!.email).toBe('test@example.com');
  });

  it('should correctly format register requests', async () => {
    mock.onPost('/auth/register').reply(config => {
      const data = JSON.parse(config.data);
      expect(data.email).toBe('test@example.com');
      expect(data.password).toBe('password');
      return [201, { message: 'Successfully registered! Please check your email for the 6-digit OTP code.' }];
    });

    const response = await client.auth.register({ email: 'test@example.com', password: 'password' });
    expect(response.message).toContain('Successfully registered');
  });

  it('should format login requests using password', async () => {
    mock.onPost('/auth/login/local').reply(config => {
      const data = JSON.parse(config.data);
      expect(data.email).toBe('test@example.com');
      expect(data.password).toBe('password');
      return [200, { message: 'Authenticated successfully' }];
    });

    const response = await client.auth.login({ email: 'test@example.com', password: 'password' });
    expect(response.message).toBe('Authenticated successfully');
  });

  it('should build OAuth login URLs for registered provider keys', () => {
    const url = client.auth.getOAuthLoginUrl('discord');

    expect(url).toBe('http://localhost:8000/auth/login/discord?api_key=test_api_key');
  });

  it('should extract nested API error messages cleanly', async () => {
    mock.onPost('/auth/login/local').reply(401, {
      detail: 'Invalid credentials'
    });

    await expect(client.auth.login({ email: 'test@example.com', password: 'wrong' }))
      .rejects.toThrow('Invalid credentials');
  });

  it('should expose refreshed access tokens to tenant app API clients', async () => {
    mock.onPost('/auth/refresh').reply(200, { access_token: 'new_access_token' });

    const token = await client.refreshAccessToken();

    expect(token).toBe('new_access_token');
    expect(client.getAccessToken()).toBe('new_access_token');
  });

  it('should retry queued requests after a single refresh', async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;

    mock.onPost('/auth/refresh').reply(() => {
      refreshCalls += 1;
      return [200, { access_token: 'queued_token' }];
    });

    mock.onGet('/users/me').reply(config => {
      protectedCalls += 1;
      if (!config.headers?.Authorization) {
        return [401, { detail: 'expired' }];
      }
      return [200, { id: '123', email: 'test@example.com', role: 'user' }];
    });

    const [first, second] = await Promise.all([
      client.users.getMe(),
      client.users.getMe(),
    ]);

    expect(first!.id).toBe('123');
    expect(second!.id).toBe('123');
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
  });
});
