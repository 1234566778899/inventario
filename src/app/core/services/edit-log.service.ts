import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogAction } from '../models';

@Injectable({ providedIn: 'root' })
export class EditLogService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  async log(
    tableName: string,
    recordId: string,
    action: LogAction,
    oldData: Record<string, unknown> | null = null,
    newData: Record<string, unknown> | null = null
  ): Promise<void> {
    const userId = this.authService.currentUser()?.id ?? null;

    const { error } = await this.supabase.client.from('edit_logs').insert({
      table_name: tableName,
      record_id: recordId,
      user_id: userId,
      action,
      old_data: oldData,
      new_data: newData,
    });

    if (error) {
      console.error('[EditLog] Error logging action:', error.message);
    }
  }

  async getAll(limit = 200) {
    const { data, error } = await this.supabase.client
      .from('edit_logs')
      .select('*, user:user_id(id, email, full_name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }
}
