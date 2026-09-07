import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { AuthError, Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { User } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  // Reactive state
  readonly currentUser   = signal<User | null>(null);
  readonly profileLoaded = signal(false);
  readonly isAdmin       = computed(() => this.currentUser()?.role === 'admin');
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  constructor() {
    // Initialize session from storage
    this.supabase.client.auth.getSession().then(({ data }) => {
      if (data.session) {
        this.loadProfile(data.session.user.id);
      } else {
        this.profileLoaded.set(true); // no session → done loading
      }
    });

    // Listen for auth state changes
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      if (session) {
        this.profileLoaded.set(false);
        this.loadProfile(session.user.id);
      } else {
        this.currentUser.set(null);
        this.profileLoaded.set(true);
      }
    });
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      this.currentUser.set(data as User);
    }
    this.profileLoaded.set(true);
  }

  async login(email: string, password: string): Promise<{ error: AuthError | null }> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    return { error };
  }

  async logout(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  async deleteUser(userId: string): Promise<{ error: Error | null }> {
    try {
      const res = await fetch(`${environment.supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'apikey': environment.supabaseServiceRoleKey,
          'Authorization': `Bearer ${environment.supabaseServiceRoleKey}`,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: new Error(body.message ?? body.error ?? `Error ${res.status}`) };
      }
      return { error: null };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.supabase.client.auth.getSession();
    return data.session;
  }

  /**
   * Create a new user via the admin API.
   * In production, delegate this to a Supabase Edge Function.
   */
  async createUser(
    email: string,
    password: string,
    fullName: string,
    role: 'admin' | 'user'
  ): Promise<{ error: Error | null }> {
    try {
      // The API gateway validates the service role key via `apikey` header and
      // sets the auth context for GoTrue internally — no Bearer token needed here.
      const res = await fetch(`${environment.supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': environment.supabaseServiceRoleKey,
          'Authorization': `Bearer ${environment.supabaseServiceRoleKey}`,
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role },
          app_metadata: { role },
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: new Error(body.message ?? body.msg ?? body.error ?? `Error ${res.status}`) };
      }

      return { error: null };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  /**
   * Update an existing user via the admin API. Only sends email/password when
   * provided. In production, delegate this to a Supabase Edge Function.
   */
  async updateUser(
    userId: string,
    changes: { fullName: string; role: 'admin' | 'user'; email?: string; password?: string }
  ): Promise<{ error: Error | null }> {
    try {
      const payload: Record<string, unknown> = {
        user_metadata: { full_name: changes.fullName, role: changes.role },
        app_metadata: { role: changes.role },
      };
      if (changes.email) payload['email'] = changes.email;
      if (changes.password) payload['password'] = changes.password;

      const res = await fetch(`${environment.supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': environment.supabaseServiceRoleKey,
          'Authorization': `Bearer ${environment.supabaseServiceRoleKey}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: new Error(body.message ?? body.msg ?? body.error ?? `Error ${res.status}`) };
      }
      return { error: null };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }
}
