import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { EditLogService } from './edit-log.service';
import { Supplier } from '../models';

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly supabase = inject(SupabaseService);
  private readonly editLog = inject(EditLogService);

  async getAll(): Promise<Supplier[]> {
    const { data, error } = await this.supabase.client
      .from('suppliers')
      .select('*')
      .order('name');

    if (error) throw error;
    return (data ?? []) as Supplier[];
  }

  async getById(id: string): Promise<Supplier> {
    const { data, error } = await this.supabase.client
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Supplier;
  }

  async create(payload: Omit<Supplier, 'id' | 'created_at'>): Promise<Supplier> {
    const { data, error } = await this.supabase.client
      .from('suppliers')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    await this.editLog.log('suppliers', data.id, 'insert', null, data);
    return data as Supplier;
  }

  async update(id: string, payload: Partial<Omit<Supplier, 'id' | 'created_at'>>): Promise<Supplier> {
    const old = await this.getById(id);

    const { data, error } = await this.supabase.client
      .from('suppliers')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await this.editLog.log('suppliers', id, 'update', old as unknown as Record<string, unknown>, data);
    return data as Supplier;
  }

  async delete(id: string): Promise<void> {
    const old = await this.getById(id);

    const { error } = await this.supabase.client
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await this.editLog.log('suppliers', id, 'delete', old as unknown as Record<string, unknown>, null);
  }
}
