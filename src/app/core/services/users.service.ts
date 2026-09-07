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
   * Edits an existing user: name/role always, email/password only when given.
   * The auth record (admin API) and the profiles row are both kept in sync.
   */
  async updateUser(
    userId: string,
    changes: { fullName: string; role: 'admin' | 'user'; email?: string; password?: string }
  ): Promise<{ error: Error | null }> {
    const { error: authError } = await this.authService.updateUser(userId, changes);
    if (authError) return { error: authError };

    const profilePatch: Record<string, unknown> = {
      full_name: changes.fullName,
      role: changes.role,
    };
    if (changes.email) profilePatch['email'] = changes.email;

    const { error } = await this.supabase.client
      .from('profiles')
      .update(profilePatch)
      .eq('id', userId);

    return { error: error ? new Error(error.message) : null };
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
