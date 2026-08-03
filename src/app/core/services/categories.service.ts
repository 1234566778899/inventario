import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { EditLogService } from './edit-log.service';
import { Category } from '../models';

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly supabase = inject(SupabaseService);
  private readonly editLog = inject(EditLogService);

  async getAll(): Promise<Category[]> {
    const { data, error } = await this.supabase.client
      .from('categories')
      .select('*, parent:categories!parent_id(id, name)')
      .order('name');

    if (error) throw error;
    return (data ?? []) as Category[];
  }

  async getById(id: string): Promise<Category> {
    const { data, error } = await this.supabase.client
      .from('categories')
      .select('*, parent:categories!parent_id(id, name)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Category;
  }

  async create(payload: Omit<Category, 'id' | 'created_at' | 'parent' | 'children'>): Promise<Category> {
    const { data, error } = await this.supabase.client
      .from('categories')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    await this.editLog.log('categories', data.id, 'insert', null, data);
    return data as Category;
  }

  async update(id: string, payload: Partial<Omit<Category, 'id' | 'created_at' | 'parent' | 'children'>>): Promise<Category> {
    const old = await this.getById(id);

    const { data, error } = await this.supabase.client
      .from('categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await this.editLog.log('categories', id, 'update', old as unknown as Record<string, unknown>, data);
    return data as Category;
  }

  async delete(id: string): Promise<void> {
    const old = await this.getById(id);

    const { error } = await this.supabase.client
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await this.editLog.log('categories', id, 'delete', old as unknown as Record<string, unknown>, null);
  }
}
