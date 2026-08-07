import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { EditLogService } from './edit-log.service';
import { CustomField } from '../models';

@Injectable({ providedIn: 'root' })
export class CustomFieldsService {
  private readonly supabase = inject(SupabaseService);
  private readonly editLog = inject(EditLogService);

  /**
   * Whether the `show_in_table` column exists yet. It ships in a migration, so
   * until that runs the field is stripped from writes — sending an unknown
   * column makes PostgREST reject the whole request.
   * See supabase/migrations/20260807_custom_fields_show_in_table.sql
   */
  private supportsShowInTable: boolean | null = null;

  /** False until the migration runs; the UI disables the table-column toggle. */
  get hasShowInTable(): boolean {
    return this.supportsShowInTable !== false;
  }

  private stripUnsupported<T extends Record<string, unknown>>(payload: T): T {
    if (this.supportsShowInTable !== false || !('show_in_table' in payload)) return payload;
    const { show_in_table, ...rest } = payload;
    void show_in_table;
    return rest as unknown as T;
  }

  async getAll(): Promise<CustomField[]> {
    const { data, error } = await this.supabase.client
      .from('custom_fields')
      .select('*')
      .order('display_order');

    if (error) throw error;

    const rows = (data ?? []) as CustomField[];
    if (rows.length > 0) {
      this.supportsShowInTable = 'show_in_table' in rows[0];
    }
    return rows;
  }

  async create(payload: Omit<CustomField, 'id' | 'created_at'>): Promise<CustomField> {
    const { data, error } = await this.supabase.client
      .from('custom_fields')
      .insert(this.stripUnsupported(payload))
      .select()
      .single();

    if (error) throw error;
    await this.editLog.log('custom_fields', data.id, 'insert', null, data);
    return data as CustomField;
  }

  async update(id: string, payload: Partial<Omit<CustomField, 'id' | 'created_at'>>): Promise<CustomField> {
    const { data: old } = await this.supabase.client.from('custom_fields').select('*').eq('id', id).single();

    const { data, error } = await this.supabase.client
      .from('custom_fields')
      .update(this.stripUnsupported(payload))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await this.editLog.log('custom_fields', id, 'update', old, data);
    return data as CustomField;
  }

  async delete(id: string): Promise<void> {
    const { data: old } = await this.supabase.client.from('custom_fields').select('*').eq('id', id).single();

    const { error } = await this.supabase.client
      .from('custom_fields')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await this.editLog.log('custom_fields', id, 'delete', old, null);
  }
}
