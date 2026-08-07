// ─── Auth / Profiles ─────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
  created_at: string;
}

// ─── Categories ──────────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  created_at: string;
  // joined
  parent?: Category | null;
  children?: Category[];
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Custom Fields ───────────────────────────────────────────────────────────
export type CustomFieldType = 'text' | 'number' | 'boolean' | 'date' | 'select';

export interface CustomField {
  id: string;
  name: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  /** Shown in the product create/edit form. */
  is_visible: boolean;
  /**
   * Offered as a column in the products table. Optional because the column is
   * added by a migration — callers should fall back to `is_visible`.
   */
  show_in_table?: boolean;
  display_order: number;
  created_at: string;
}

export interface ProductCustomValue {
  id: string;
  product_id: string;
  field_id: string;
  value: string | null;
}

// ─── Products ────────────────────────────────────────────────────────────────
export interface Product {
  id: string;
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
  image_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category | null;
  supplier?: Supplier | null;
  custom_values?: ProductCustomValue[];
}

// ─── Product search filters ──────────────────────────────────────────────────
export type ProductStatusFilter = 'all' | 'active' | 'inactive';

export interface ProductFilters {
  search: string;
  categoryId: string;
  supplierId: string;
  priceMin: number | null;
  priceMax: number | null;
  stockMin: number | null;
  stockMax: number | null;
  status: ProductStatusFilter;
  lowStockOnly: boolean;
  location: string;
}

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  search: '',
  categoryId: '',
  supplierId: '',
  priceMin: null,
  priceMax: null,
  stockMin: null,
  stockMax: null,
  status: 'all',
  lowStockOnly: false,
  location: '',
};

// ─── Stock Movements ─────────────────────────────────────────────────────────
export type MovementType = 'entrada' | 'salida' | 'ajuste';

export interface StockMovement {
  id: string;
  product_id: string;
  user_id: string;
  type: MovementType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  notes: string | null;
  created_at: string;
  // joined
  product?: Pick<Product, 'id' | 'sku' | 'name'> | null;
  user?: Pick<User, 'id' | 'email' | 'full_name'> | null;
}

// ─── Edit Logs ───────────────────────────────────────────────────────────────
export type LogAction = 'insert' | 'update' | 'delete';

export interface EditLog {
  id: string;
  table_name: string;
  record_id: string;
  user_id: string | null;
  action: LogAction;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  // joined
  user?: Pick<User, 'id' | 'email' | 'full_name'> | null;
}

// ─── Column Preferences ──────────────────────────────────────────────────────
export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface ColumnPreference {
  id: string;
  user_id: string;
  table_name: string;
  config: { columns: ColumnConfig[] };
}
