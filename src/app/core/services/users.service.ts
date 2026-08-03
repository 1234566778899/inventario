import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { User } from '../models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  async getAll(): Promise<User[]> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .order('email');

    if (error) throw error;
    return (data ?? []) as User[];
  }

  async updateRole(userId: string, role: 'admin' | 'user'): Promise<void> {
    const { error } = await this.supabase.client
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) throw error;
  }

  /**
   * Creates a new user via the admin API.
   * In production, use a Supabase Edge Function to avoid exposing the service_role key.
   */
  async deleteUser(userId: string): Promise<{ error: Error | null }> {
    return this.authService.deleteUser(userId);
  }

  async createUser(
    email: string,
    password: string,
    fullName: string,
    role: 'admin' | 'user'
  ): Promise<{ error: Error | null }> {
    return this.authService.createUser(email, password, fullName, role);
  }
}
