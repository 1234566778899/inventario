import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { EditLogService } from './edit-log.service';
import { Product, ProductCustomValue, ProductFilters } from '../models';
import { environment } from '../../../environments/environment';

/**
 * Columns the products table may be ordered by. Whitelisted because the value
 * goes straight into the query, and restricted to real columns — PostgREST
 * cannot order parent rows by a joined table, so category is not sortable.
 */
const SORTABLE_COLUMNS = [
  'sku', 'name', 'price', 'cost', 'stock_current', 'stock_minimum', 'location', 'is_active',
  'created_at',
];

/** Natural order of the catalogue: newest product first, so fresh entries are
 *  visible without paging to the end. */
const DEFAULT_SORT = 'created_at';
const DEFAULT_SORT_ASC = false;

/** Una fila lista para escribirse en `products` desde una importación. */
export interface ProductImportRow {
  sku: string;
  name: string;
  description: string | null;
  category_id: string | null;
  supplier_id: string | null;
  unit: string;
  price: number;
  cost: number;
  stock_current: number;
  stock_minimum: number;
  location: string | null;
  is_active: boolean;
}

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
    filters?: Partial<ProductFilters>;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }): Promise<{ data: Product[]; count: number }> {
    const from = params.page * params.pageSize;
    const to   = from + params.pageSize - 1;

    // Sorting must run in the database: the table is paginated server-side, so
    // ordering only the current page would rank 25 of 31 rows and silently give
    // the wrong "top" result.
    const sortBy = SORTABLE_COLUMNS.includes(params.sortBy ?? '') ? params.sortBy! : DEFAULT_SORT;
    const ascending = params.sortDir !== 'desc';

    let query = this.supabase.client
      .from('products')
      .select(`*, category:category_id(id, name), supplier:supplier_id(id, name), custom_values:product_custom_values(*)`, { count: 'exact' })
      .order(sortBy, { ascending })
      // Tie-break on id. The seeded catalogue shares one created_at, and Postgres
      // orders tied rows arbitrarily per query — without this, paging re-shuffles
      // the ties and a product can repeat on one page and vanish from the next.
      .order('id', { ascending: true });

    const search = params.filters?.search ?? params.search;
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const lowIds = params.filters?.lowStockOnly ? await this.lowStockIds() : undefined;
    query = this.applyFilters(query, params.filters, lowIds);

    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const result = { data: (data ?? []) as Product[], count: count ?? 0 };
    this._cache = result;
    return result;
  }

  /**
   * PostgREST cannot compare two columns, so "below minimum" is resolved to an
   * explicit id list that the main query can then filter on.
   */
  private async lowStockIds(): Promise<string[]> {
    const { data } = await this.supabase.client
      .from('products')
      .select('id, stock_current, stock_minimum');
    return (data ?? [])
      .filter(p => p.stock_current <= p.stock_minimum)
      .map(p => p.id);
  }

  /**
   * Translates the advanced filter panel into PostgREST constraints.
   * Kept synchronous on purpose: the query builder is thenable, so returning it
   * from an async function would execute the query instead of passing it along.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilters(query: any, f?: Partial<ProductFilters>, lowIds?: string[]): any {
    if (!f) return query;

    if (f.categoryId) query = query.eq('category_id', f.categoryId);
    if (f.supplierId) query = query.eq('supplier_id', f.supplierId);
    if (f.location)   query = query.ilike('location', `%${f.location}%`);

    if (f.status === 'active')   query = query.eq('is_active', true);
    if (f.status === 'inactive') query = query.eq('is_active', false);

    if (f.priceMin != null) query = query.gte('price', f.priceMin);
    if (f.priceMax != null) query = query.lte('price', f.priceMax);
    if (f.stockMin != null) query = query.gte('stock_current', f.stockMin);
    if (f.stockMax != null) query = query.lte('stock_current', f.stockMax);

    if (f.lowStockOnly && lowIds) {
      // An empty `in` list is invalid, so use a sentinel that matches nothing.
      query = query.in('id', lowIds.length > 0 ? lowIds : ['00000000-0000-0000-0000-000000000000']);
    }

    return query;
  }

  async getAllFiltered(search?: string, filters?: Partial<ProductFilters>): Promise<Product[]> {
    // Same order as the table on screen, so an export matches what was exported.
    let query = this.supabase.client
      .from('products')
      .select(`*, category:category_id(id, name), supplier:supplier_id(id, name)`)
      .order(DEFAULT_SORT, { ascending: DEFAULT_SORT_ASC })
      .order('id', { ascending: true });

    const term = filters?.search ?? search;
    if (term) {
      query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
    }
    const lowIds = filters?.lowStockOnly ? await this.lowStockIds() : undefined;
    query = this.applyFilters(query, filters, lowIds);

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

    // Inline editing can save a custom value alone, leaving no product column to
    // write — an UPDATE with no columns is rejected, so skip it entirely.
    let data: unknown = old;
    if (Object.keys(payload).length > 0) {
      const res = await this.supabase.client
        .from('products')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (res.error) throw res.error;
      data = res.data;
    }

    // Upsert custom values
    for (const cv of customValues) {
      await this.supabase.client.from('product_custom_values').upsert(
        { product_id: id, field_id: cv.field_id, value: cv.value },
        { onConflict: 'product_id,field_id' }
      );
    }

    await this.editLog.log(
      'products', id, 'update',
      old as unknown as Record<string, unknown>,
      data as Record<string, unknown>,
    );
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

  /**
   * Alta masiva desde una importación. Hace upsert sobre el `sku` (único) por
   * lotes, y si un lote falla reintenta fila por fila para poder decir
   * exactamente cuáles se cayeron en vez de perder el lote entero.
   */
  async importProducts(
    rows: ProductImportRow[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ ok: number; failed: { sku: string; message: string }[] }> {
    const CHUNK = 100;
    let ok = 0;
    const failed: { sku: string; message: string }[] = [];

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.supabase.client
        .from('products')
        .upsert(chunk, { onConflict: 'sku' });

      if (!error) {
        ok += chunk.length;
      } else {
        for (const row of chunk) {
          const res = await this.supabase.client
            .from('products')
            .upsert(row, { onConflict: 'sku' });
          if (res.error) failed.push({ sku: row.sku, message: res.error.message });
          else ok++;
        }
      }
      onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
    }

    this.invalidateCache();
    return { ok, failed };
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
