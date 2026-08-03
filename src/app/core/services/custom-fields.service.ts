import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { EditLogService } from './edit-log.service';
import { CustomField } from '../models';

@Injectable({ providedIn: 'root' })
export class CustomFieldsService {
  private readonly supabase = inject(SupabaseService);
  private readonly editLog = inject(EditLogService);

  async getAll(): Promise<CustomField[]> {
    const { data, error } = await this.supabase.client
      .from('custom_fields')
      .select('*')
      .order('display_order');

    if (error) throw error;
    return (data ?? []) as CustomField[];
  }

  async create(payload: Omit<CustomField, 'id' | 'created_at'>): Promise<CustomField> {
    const { data, error } = await this.supabase.client
      .from('custom_fields')
      .insert(payload)
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
      .update(payload)
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
