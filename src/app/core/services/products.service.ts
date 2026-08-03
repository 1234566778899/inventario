import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { EditLogService } from './edit-log.service';
import { Product, ProductCustomValue } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly supabase = inject(SupabaseService);
  private readonly editLog = inject(EditLogService);

  private _cache: { data: Product[]; count: number } | null = null;

  readonly stockChanged$ = new Subject<void>();
  notifyStockChanged(): void { this.stockChanged$.next(); }

  getCached(): { data: Product[]; count: number } | null { return this._cache; }
  invalidateCache(): void { this._cache = null; }

  async getAll(): Promise<Product[]> {
    const { data, error } = await this.supabase.client
      .from('products')
      .select(`*, category:category_id(id, name), supplier:supplier_id(id, name), custom_values:product_custom_values(*)`)
      .order('name');
    if (error) throw error;
    return (data ?? []) as Product[];
  }

  async getPage(params: {
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<{ data: Product[]; count: number }> {
    const from = params.page * params.pageSize;
    const to   = from + params.pageSize - 1;

    let query = this.supabase.client
      .from('products')
      .select(`*, category:category_id(id, name), supplier:supplier_id(id, name), custom_values:product_custom_values(*)`, { count: 'exact' })
      .order('name');

    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,sku.ilike.%${params.search}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const result = { data: (data ?? []) as Product[], count: count ?? 0 };
    this._cache = result;
    return result;
  }

  async getAllFiltered(search?: string): Promise<Product[]> {
    let query = this.supabase.client
      .from('products')
      .select(`*, category:category_id(id, name), supplier:supplier_id(id, name)`)
      .order('name');
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Product[];
  }

  async getLowStock(): Promise<Product[]> {
    const { data, error } = await this.supabase.client
      .from('products')
      .select(`*, category:category_id(id, name), supplier:supplier_id(id, name)`)
      .filter('stock_current', 'lte', this.supabase.client.from('products').select('stock_minimum'))
      .order('name');

    // Fallback: fetch all and filter
    if (error) {
      const all = await this.getAll();
      return all.filter(p => p.stock_current <= p.stock_minimum);
    }

    const all = await this.getAll();
    return all.filter(p => p.stock_current <= p.stock_minimum && p.is_active);
  }

  async getById(id: string): Promise<Product> {
    const { data, error } = await this.supabase.client
      .from('products')
      .select(`
        *,
        category:category_id(id, name),
        supplier:supplier_id(id, name),
        custom_values:product_custom_values(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Product;
  }

  async create(
    payload: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'category' | 'supplier' | 'custom_values'>,
    customValues: { field_id: string; value: string }[] = []
  ): Promise<Product> {
    const { data, error } = await this.supabase.client
      .from('products')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    if (customValues.length > 0) {
      await this.supabase.client.from('product_custom_values').insert(
        customValues.map(cv => ({ product_id: data.id, field_id: cv.field_id, value: cv.value }))
      );
    }

    await this.editLog.log('products', data.id, 'insert', null, data);
    return this.getById(data.id);
  }

  async update(
    id: string,
    payload: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at' | 'category' | 'supplier' | 'custom_values'>>,
    customValues: { field_id: string; value: string }[] = []
  ): Promise<Product> {
    const old = await this.getById(id);

    const { data, error } = await this.supabase.client
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Upsert custom values
    for (const cv of customValues) {
      await this.supabase.client.from('product_custom_values').upsert(
        { product_id: id, field_id: cv.field_id, value: cv.value },
        { onConflict: 'product_id,field_id' }
      );
    }

    await this.editLog.log('products', id, 'update', old as unknown as Record<string, unknown>, data);
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const old = await this.getById(id);

    const { error } = await this.supabase.client
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await this.editLog.log('products', id, 'delete', old as unknown as Record<string, unknown>, null);
  }

  async updateStock(id: string, newStock: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('products')
      .update({ stock_current: newStock })
      .eq('id', id);

    if (error) throw error;
  }

  async uploadImage(file: File, productId: string): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${productId}.${ext}`;
    const bucket = 'product-images';
    const res = await fetch(`${environment.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        'apikey': environment.supabaseServiceRoleKey,
        'Authorization': `Bearer ${environment.supabaseServiceRoleKey}`,
        'Content-Type': file.type,
        'x-upsert': 'true',
      },
      body: file,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? body.error ?? `Error ${res.status}`);
    }

    return `${environment.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }

  async getCustomValues(productId: string): Promise<ProductCustomValue[]> {
    const { data, error } = await this.supabase.client
      .from('product_custom_values')
      .select('*')
      .eq('product_id', productId);

    if (error) throw error;
    return (data ?? []) as ProductCustomValue[];
  }
}
