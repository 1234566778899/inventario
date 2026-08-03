import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ColumnConfig, ColumnPreference } from '../models';

@Injectable({ providedIn: 'root' })
export class ColumnPreferencesService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  async get(tableName: string): Promise<ColumnConfig[] | null> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return null;

    const { data } = await this.supabase.client
      .from('column_preferences')
      .select('config')
      .eq('user_id', userId)
      .eq('table_name', tableName)
      .maybeSingle();

    if (!data) return null;
    const pref = data as Pick<ColumnPreference, 'config'>;
    return pref.config?.columns ?? null;
  }

  async save(tableName: string, columns: ColumnConfig[]): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    const { error } = await this.supabase.client
      .from('column_preferences')
      .upsert(
        { user_id: userId, table_name: tableName, config: { columns } },
        { onConflict: 'user_id,table_name' }
      );

    if (error) throw error;
  }
}
