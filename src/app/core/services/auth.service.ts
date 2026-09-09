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
        // 23503 = stock_movements still references this account (ON DELETE
        // RESTRICT). That guard is deliberate: it keeps the movement history
        // attributable. Deactivating is the way out, so say so.
        if (body.code === '23503') {
          return {
            error: new Error(
              'No se puede eliminar: el usuario tiene movimientos registrados y su ' +
              'historial debe conservarse. Desactívalo en su lugar.'
            ),
          };
        }
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
   * Activates or deactivates an account through GoTrue's ban flag.
   *
   * A ban is the real switch, not a cosmetic one: it rejects new logins *and*
   * refresh-token exchanges, so an open session dies as soon as its access
   * token expires and supabase-js fails to refresh it — which signs the user
   * out through the normal auth-state listener. It is also fully reversible.
   */
  async setUserActive(userId: string, active: boolean): Promise<{ error: Error | null }> {
    try {
      const res = await fetch(`${environment.supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': environment.supabaseServiceRoleKey,
          'Authorization': `Bearer ${environment.supabaseServiceRoleKey}`,
        },
        // 'none' lifts the ban; the long duration stands in for "indefinite",
        // which GoTrue has no keyword for.
        body: JSON.stringify({ ban_duration: active ? 'none' : '876000h' }),
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
   * Whether each account can currently sign in, keyed by user id.
   *
   * Read straight from GoTrue rather than mirrored into a profiles column, so
   * there is a single source of truth that cannot drift from the actual ban.
   */
  async fetchActiveStates(): Promise<Map<string, boolean>> {
    const states = new Map<string, boolean>();
    try {
      const res = await fetch(`${environment.supabaseUrl}/auth/v1/admin/users?per_page=200`, {
        headers: {
          'apikey': environment.supabaseServiceRoleKey,
          'Authorization': `Bearer ${environment.supabaseServiceRoleKey}`,
        },
      });
      if (!res.ok) return states;

      const body = await res.json();
      for (const u of body.users ?? []) {
        // banned_until is a timestamp, so a lapsed ban counts as active again.
        const until = u.banned_until ? new Date(u.banned_until).getTime() : 0;
        states.set(u.id, until <= Date.now());
      }
    } catch {
      // Listing is best-effort: the users table still renders without it.
    }
    return states;
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
