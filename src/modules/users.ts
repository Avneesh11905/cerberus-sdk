import { AxiosInstance } from 'axios';
import { User, ProfileUpdate, MessageResponse } from '../types';
import type { CerberusClient } from '../client';

export class UsersModule {
  private currentUser: User | null = null;
  private userPromise: Promise<User | null> | null = null;

  constructor(private client: AxiosInstance, private parentClient?: CerberusClient) {}

  clearCache(): void {
    this.currentUser = null;
    this.userPromise = null;
  }

  async getMe(forceRefresh = false): Promise<User | null> {
    if (!forceRefresh && this.currentUser) {
      return this.currentUser;
    }

    if (this.userPromise) {
      return this.userPromise;
    }

    this.userPromise = this.client.get<User>('/users/me').then((response) => {
      this.currentUser = response.data;
      this.userPromise = null;
      return response.data;
    }).catch(() => {
      this.clearCache();
      return null;
    });

    return this.userPromise;
  }

  async updateMe(data: ProfileUpdate): Promise<User> {
    const response = await this.client.patch<User>('/users/me', data);
    if (this.parentClient) {
      this.getMe(true).catch(() => {});
    }
    return response.data;
  }

  async deleteMe(): Promise<void> {
    await this.client.delete('/users/me');
    if (this.parentClient) {
      this.parentClient.clearUser();
    }
  }
}
