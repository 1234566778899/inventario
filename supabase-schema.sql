-- ============================================================
-- FERRETERÍA INVENTARIO — SCHEMA COMPLETO
-- Drop & Create — ejecuta completo en Supabase → SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── DROP en orden inverso de dependencias ───────────────────────────────────
DROP TRIGGER  IF EXISTS on_auth_user_created  ON auth.users;
-- products_updated_at se elimina junto con la tabla (DROP TABLE ... CASCADE, abajo).
-- No se puede hacer DROP TRIGGER ... ON public.products aquí: el IF EXISTS cubre
-- el trigger, pero no la tabla, y en una BD nueva products todavía no existe.

DROP TABLE IF EXISTS public.column_preferences    CASCADE;
DROP TABLE IF EXISTS public.edit_logs             CASCADE;
DROP TABLE IF EXISTS public.stock_movements       CASCADE;
DROP TABLE IF EXISTS public.product_custom_values CASCADE;
DROP TABLE IF EXISTS public.custom_fields         CASCADE;
DROP TABLE IF EXISTS public.products              CASCADE;
DROP TABLE IF EXISTS public.suppliers             CASCADE;
DROP TABLE IF EXISTS public.categories            CASCADE;
DROP TABLE IF EXISTS public.profiles              CASCADE;

DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user()   CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at()    CASCADE;

-- ============================================================
-- PROFILES  (va primero — todo lo demás depende de ella)
-- ============================================================
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  full_name  TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ─── Función helper anti-recursión ───────────────────────────────────────────
-- Creada DESPUÉS de profiles para que PostgreSQL encuentre la tabla.
-- SECURITY DEFINER bypasea las RLS al leer el rol → sin recursión infinita.
CREATE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── RLS de profiles ─────────────────────────────────────────────────────────
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (current_user_role() = 'admin');

CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (current_user_role() = 'admin');

-- ─── Trigger: crea perfil al registrar usuario ───────────────────────────────
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE public.categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  parent_id   UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_auth"
  ON public.categories FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "categories_insert_admin"
  ON public.categories FOR INSERT WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "categories_update_admin"
  ON public.categories FOR UPDATE USING (current_user_role() = 'admin');

CREATE POLICY "categories_delete_admin"
  ON public.categories FOR DELETE USING (current_user_role() = 'admin');

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE public.suppliers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  contact_name TEXT,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select_auth"
  ON public.suppliers FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "suppliers_insert_admin"
  ON public.suppliers FOR INSERT WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "suppliers_update_admin"
  ON public.suppliers FOR UPDATE USING (current_user_role() = 'admin');

CREATE POLICY "suppliers_delete_admin"
  ON public.suppliers FOR DELETE USING (current_user_role() = 'admin');

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE public.products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  category_id   UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  supplier_id   UUID REFERENCES public.suppliers(id)  ON DELETE SET NULL,
  unit          TEXT NOT NULL DEFAULT 'unidad',
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_current NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_minimum NUMERIC(12,3) NOT NULL DEFAULT 0,
  location      TEXT,
  -- URL pública en el bucket product-images; NULL si el producto no tiene foto.
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX products_sku_idx      ON public.products(sku);
CREATE INDEX products_category_idx ON public.products(category_id);
CREATE INDEX products_supplier_idx ON public.products(supplier_id);

CREATE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_auth"
  ON public.products FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "products_insert_admin"
  ON public.products FOR INSERT WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "products_update_admin"
  ON public.products FOR UPDATE USING (current_user_role() = 'admin');

CREATE POLICY "products_delete_admin"
  ON public.products FOR DELETE USING (current_user_role() = 'admin');

-- ============================================================
-- CUSTOM FIELDS
-- ============================================================
CREATE TABLE public.custom_fields (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  field_type    TEXT NOT NULL CHECK (field_type IN ('text','number','boolean','date','select')),
  options       JSONB,
  is_required   BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible    BOOLEAN NOT NULL DEFAULT TRUE,   -- shown in the product form
  show_in_table BOOLEAN NOT NULL DEFAULT TRUE,   -- offered as a table column
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_fields_select_auth"
  ON public.custom_fields FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "custom_fields_write_admin"
  ON public.custom_fields FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ============================================================
-- PRODUCT CUSTOM VALUES
-- ============================================================
CREATE TABLE public.product_custom_values (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id)      ON DELETE CASCADE,
  field_id   UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  value      TEXT,
  UNIQUE(product_id, field_id)
);

ALTER TABLE public.product_custom_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_values_select_auth"
  ON public.product_custom_values FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "custom_values_write_admin"
  ON public.product_custom_values FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================
-- user_id → profiles (no auth.users) para que PostgREST pueda
-- hacer el join y leer email / full_name directamente.
CREATE TABLE public.stock_movements (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID         NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id        UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  type           TEXT         NOT NULL CHECK (type IN ('entrada','salida','ajuste')),
  quantity       NUMERIC(12,3) NOT NULL,
  previous_stock NUMERIC(12,3) NOT NULL,
  new_stock      NUMERIC(12,3) NOT NULL,
  reason         TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX movements_product_idx ON public.stock_movements(product_id);
CREATE INDEX movements_user_idx    ON public.stock_movements(user_id);
CREATE INDEX movements_created_idx ON public.stock_movements(created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movements_select_auth"
  ON public.stock_movements FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "movements_insert_auth"
  ON public.stock_movements FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "movements_delete_admin"
  ON public.stock_movements FOR DELETE USING (current_user_role() = 'admin');

-- ============================================================
-- EDIT LOGS
-- ============================================================
-- user_id → profiles por la misma razón que stock_movements.
CREATE TABLE public.edit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     TEXT NOT NULL CHECK (action IN ('insert','update','delete')),
  old_data   JSONB,
  new_data   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX edit_logs_table_idx   ON public.edit_logs(table_name);
CREATE INDEX edit_logs_user_idx    ON public.edit_logs(user_id);
CREATE INDEX edit_logs_created_idx ON public.edit_logs(created_at DESC);

ALTER TABLE public.edit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edit_logs_select_auth"
  ON public.edit_logs FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "edit_logs_insert_auth"
  ON public.edit_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- COLUMN PREFERENCES
-- ============================================================
CREATE TABLE public.column_preferences (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}',
  UNIQUE(user_id, table_name)
);

ALTER TABLE public.column_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "colpref_own"
  ON public.column_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ASIGNAR ROL ADMIN AL PRIMER USUARIO
-- ============================================================
-- Descomenta y ajusta el email, luego ejecuta:
--
-- UPDATE public.profiles SET role = 'admin'
-- WHERE email = 'tu-email@aqui.com';
