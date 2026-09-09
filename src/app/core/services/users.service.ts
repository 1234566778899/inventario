import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { User } from '../models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  async getAll(): Promise<User[]> {
    const [{ data, error }, activeStates] = await Promise.all([
      this.supabase.client.from('profiles').select('*').order('email'),
      this.authService.fetchActiveStates(),
    ]);

    if (error) throw error;
    // Unknown ids default to active so a failed admin listing never makes every
    // account look deactivated.
    return (data ?? []).map(row => ({
      ...(row as User),
      is_active: activeStates.get((row as User).id) ?? true,
    }));
  }

  /** Blocks or restores sign-in for an account without touching its history. */
  async setActive(userId: string, active: boolean): Promise<{ error: Error | null }> {
    return this.authService.setUserActive(userId, active);
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
