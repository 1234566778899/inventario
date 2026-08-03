-- ============================================================
-- FERRETERÍA INVENTARIO — DATOS DE EJEMPLO
-- Ejecuta en Supabase → SQL Editor
--
-- PRERREQUISITO: Debes tener al menos un usuario ADMINISTRADOR
-- registrado en la app antes de ejecutar este script.
-- Los movimientos de stock se omiten si no hay admin.
-- ============================================================

-- Migración requerida (no hace daño si ya existe)
ALTER TABLE public.custom_fields
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

-- ─── Limpiar datos de ejemplo previos (idempotente) ──────────
DELETE FROM public.product_custom_values
  WHERE product_id IN (
    SELECT id FROM public.products WHERE sku LIKE 'FE-%'
  );
DELETE FROM public.stock_movements
  WHERE product_id IN (
    SELECT id FROM public.products WHERE sku LIKE 'FE-%'
  );
DELETE FROM public.products       WHERE sku         LIKE 'FE-%';
DELETE FROM public.custom_fields  WHERE id::text    LIKE 'c0000000%';
DELETE FROM public.suppliers      WHERE id::text    LIKE 'b0000000%';
DELETE FROM public.categories     WHERE id::text    LIKE 'a0000000%';


-- ============================================================
-- CATEGORÍAS
-- ============================================================

-- Padres primero
INSERT INTO public.categories (id, name, description, parent_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Herramientas',           'Herramientas manuales y eléctricas',                    NULL),
  ('a0000000-0000-0000-0000-000000000004', 'Tornillería y Fijaciones','Tornillos, clavos, tuercas y anclajes',                NULL),
  ('a0000000-0000-0000-0000-000000000005', 'Plomería',               'Tubería, accesorios y válvulas',                        NULL),
  ('a0000000-0000-0000-0000-000000000007', 'Electricidad',           'Cables, interruptores y accesorios eléctricos',         NULL),
  ('a0000000-0000-0000-0000-000000000008', 'Pintura y Acabados',     'Pinturas, solventes y herramientas de pintura',         NULL),
  ('a0000000-0000-0000-0000-000000000009', 'Construcción',           'Cemento, block, arena y materiales de obra',            NULL),
  ('a0000000-0000-0000-0000-000000000010', 'Seguridad y EPI',        'Equipo de protección personal',                         NULL);

-- Subcategorías
INSERT INTO public.categories (id, name, description, parent_id) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'Herramientas Manuales',  'Martillos, alicates, llaves y destornilladores', 'a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'Herramientas Eléctricas','Taladros, pulidoras y sierras eléctricas',       'a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000006', 'Tubería PVC',            'Tubos y accesorios de PVC para agua',            'a0000000-0000-0000-0000-000000000005');


-- ============================================================
-- PROVEEDORES
-- ============================================================

INSERT INTO public.suppliers (id, name, contact_name, email, phone, address, notes) VALUES
  (
    'b0000000-0000-0000-0000-000000000001',
    'Distribuidora Ferretera S.A.',
    'Miguel Herrera',
    'ventas@distrib-ferretera.com.gt',
    '+502 2345-6789',
    'Zona Industrial Km 12, Guatemala Ciudad',
    'Proveedor principal de herramientas y EPP. Entrega los miércoles.'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'Importaciones Técnicas GT',
    'Andrea López',
    'andrea@imptecnicas.gt',
    '+502 5534-2211',
    '4a Avenida 12-30, Zona 9, Guatemala',
    'Especialistas en eléctrico y plomería importada. Pedido mínimo Q500.'
  ),
  (
    'b0000000-0000-0000-0000-000000000003',
    'ProFerro Central',
    'Roberto Sánchez',
    'rsanchez@proferro.com',
    '+502 7832-0099',
    'Km 45 Carretera a Escuintla',
    'Tornillería y fijaciones al por mayor. 5% descuento sobre Q1,000.'
  ),
  (
    'b0000000-0000-0000-0000-000000000004',
    'Grupo Constructor Nacional',
    'Luisa Mendoza',
    'lmendoza@grupocn.gt',
    '+502 2289-4455',
    'Calzada Roosevelt 8-40, Mixco',
    'Materiales de construcción y cemento. Entrega a domicilio en 24h.'
  );


-- ============================================================
-- CAMPOS PERSONALIZADOS
-- ============================================================

INSERT INTO public.custom_fields (id, name, label, field_type, options, is_required, is_visible, display_order) VALUES
  (
    'c0000000-0000-0000-0000-000000000001',
    'marca',
    'Marca',
    'select',
    '["Stanley", "Truper", "DeWalt", "Bosch", "Irwin", "Milwaukee", "Urrea", "Genérico", "Otra"]'::jsonb,
    false, true, 0
  ),
  (
    'c0000000-0000-0000-0000-000000000002',
    'material',
    'Material',
    'select',
    '["Acero", "Acero inoxidable", "Aluminio", "PVC", "Plástico", "Madera", "Cuero", "Mixto"]'::jsonb,
    false, true, 1
  ),
  (
    'c0000000-0000-0000-0000-000000000003',
    'garantia_meses',
    'Garantía (meses)',
    'number',
    NULL,
    false, true, 2
  );


-- ============================================================
-- PRODUCTOS
-- ============================================================
-- SKU: FE-[ÁREA]-[NÚM]
--   HM = Herramienta Manual
--   HE = Herramienta Eléctrica
--   TF = Tornillería y Fijaciones
--   PL = Plomería
--   EL = Electricidad
--   PI = Pintura
--   CO = Construcción
--   SE = Seguridad

INSERT INTO public.products
  (id, sku, name, description, category_id, supplier_id, unit, price, cost, stock_current, stock_minimum, location, is_active)
VALUES

  -- ── Herramientas Manuales ─────────────────────────────────
  (
    'd0000000-0000-0000-0000-000000000001', 'FE-HM-001',
    'Martillo de uña 16 oz',
    'Martillo de carpintero con mango de fibra de vidrio, cabeza forjada 16 oz.',
    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 72.50, 42.00, 18, 5, 'A-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000002', 'FE-HM-002',
    'Desarmador plano 6"',
    'Desarmador punta plana 1/4"×6", mango bicomponente antideslizante.',
    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 24.00, 13.50, 30, 8, 'A-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000003', 'FE-HM-003',
    'Desarmador Phillips #2',
    'Desarmador de cruz #2×6", mango ergonómico con protección dieléctrica 1000V.',
    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 24.00, 13.50, 3, 8, 'A-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000004', 'FE-HM-004',
    'Alicate de punta 6"',
    'Alicate de punta larga 6", ideal para espacios reducidos, mango aislado.',
    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 48.00, 28.00, 12, 5, 'A-03', true
  ),
  (
    'd0000000-0000-0000-0000-000000000005', 'FE-HM-005',
    'Llave ajustable 10"',
    'Llave inglesa ajustable 10 pulgadas, apertura máxima 28 mm, acabado cromado.',
    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 58.00, 33.00, 8, 4, 'A-04', true
  ),
  (
    'd0000000-0000-0000-0000-000000000006', 'FE-HM-006',
    'Nivel de burbuja 24"',
    'Nivel de aluminio 24 pulgadas, 3 burbujas: horizontal, vertical y 45°.',
    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 85.00, 50.00, 6, 3, 'A-05', true
  ),
  (
    'd0000000-0000-0000-0000-000000000007', 'FE-HM-007',
    'Cinta métrica 5 m',
    'Cinta métrica 5 metros, ancho 25 mm, freno automático, carcasa de goma.',
    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 32.00, 18.00, 20, 6, 'A-06', true
  ),
  (
    'd0000000-0000-0000-0000-000000000008', 'FE-HM-008',
    'Serrucho 20"',
    'Serrucho de carpintero 20 pulgadas, 8 TPI, dientes endurecidos por inducción.',
    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 65.00, 38.00, 2, 4, 'A-07', true
  ),

  -- ── Herramientas Eléctricas ───────────────────────────────
  (
    'd0000000-0000-0000-0000-000000000009', 'FE-HE-001',
    'Taladro percutor 1/2" 550W',
    'Taladro con percusión 550 W, mandril 1/2", velocidad variable 0–3000 rpm, reversible.',
    'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 420.00, 245.00, 4, 2, 'B-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000010', 'FE-HE-002',
    'Pulidora angular 4.5" 750W',
    'Amoladora angular 4.5" 750 W, 11,000 rpm, disco incluido, protector ajustable.',
    'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 380.00, 215.00, 1, 2, 'B-01', true
  ),

  -- ── Tornillería y Fijaciones ──────────────────────────────
  (
    'd0000000-0000-0000-0000-000000000011', 'FE-TF-001',
    'Clavo de acero 2" (lb)',
    'Clavo común galvanizado 2 pulgadas. Precio por libra (~220 unidades).',
    'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
    'libra', 8.50, 5.00, 45, 10, 'C-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000012', 'FE-TF-002',
    'Clavo de acero 3" (lb)',
    'Clavo común galvanizado 3 pulgadas. Precio por libra (~145 unidades).',
    'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
    'libra', 8.00, 4.75, 60, 15, 'C-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000013', 'FE-TF-003',
    'Tornillo drywall 1" (caja 100u)',
    'Tornillo para drywall 1", punta broca #2, fosfatado negro. Caja de 100 u.',
    'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
    'caja', 18.00, 10.50, 25, 8, 'C-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000014', 'FE-TF-004',
    'Tornillo autorroscante 3/4" (caja 100u)',
    'Tornillo autoperforante cabeza plana Phillips, 3/4", zincado. Caja 100 u.',
    'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
    'caja', 15.00, 8.75, 3, 8, 'C-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000015', 'FE-TF-005',
    'Taco Fisher 1/4" (bolsa 100u)',
    'Expansor de plástico 1/4" para fijación en paredes de block o concreto. Bolsa 100 u.',
    'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
    'bolsa', 12.00, 7.00, 20, 6, 'C-03', true
  ),

  -- ── Tubería PVC ───────────────────────────────────────────
  (
    'd0000000-0000-0000-0000-000000000016', 'FE-PL-001',
    'Tubo PVC 1/2" × 6m (agua fría)',
    'Tubo PVC presión 1/2 pulgada, largo 6 m, clase 160 PSI, para agua fría.',
    'a0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002',
    'unidad', 52.00, 30.00, 22, 6, 'D-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000017', 'FE-PL-002',
    'Tubo PVC 3/4" × 6m (agua fría)',
    'Tubo PVC presión 3/4 pulgada, largo 6 m, clase 160 PSI.',
    'a0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002',
    'unidad', 72.00, 42.00, 15, 5, 'D-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000018', 'FE-PL-003',
    'Codo PVC 1/2" × 90°',
    'Accesorio codo 90° para tubo PVC 1/2".',
    'a0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002',
    'unidad', 3.25, 1.75, 0, 20, 'D-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000019', 'FE-PL-004',
    'Tee PVC 1/2"',
    'Accesorio tee para tubo PVC 1/2".',
    'a0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002',
    'unidad', 3.50, 1.90, 35, 15, 'D-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000020', 'FE-PL-005',
    'Llave de paso 1/2" (bola)',
    'Válvula de bola 1/2", cuerpo de latón, manija en T, presión máx. 200 PSI.',
    'a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002',
    'unidad', 38.00, 22.00, 10, 4, 'D-03', true
  ),
  (
    'd0000000-0000-0000-0000-000000000021', 'FE-PL-006',
    'Pegamento PVC 1/4 gl',
    'Cemento solvente para PVC, fraguado rápido, bote 1/4 galón. ASTM D2564.',
    'a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002',
    'unidad', 28.00, 16.00, 8, 3, 'D-04', true
  ),

  -- ── Electricidad ──────────────────────────────────────────
  (
    'd0000000-0000-0000-0000-000000000022', 'FE-EL-001',
    'Cable THHN #12 (metro)',
    'Cable eléctrico THHN calibre 12 AWG, 600V. Precio por metro lineal.',
    'a0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002',
    'metro', 9.50, 5.50, 0, 50, 'E-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000023', 'FE-EL-002',
    'Cable THHN #10 (metro)',
    'Cable eléctrico THHN calibre 10 AWG, 600V. Precio por metro lineal.',
    'a0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002',
    'metro', 14.00, 8.25, 80, 30, 'E-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000024', 'FE-EL-003',
    'Tomacorriente doble polarizado',
    'Tomacorriente doble con tierra física, 15A 125V, color marfil.',
    'a0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002',
    'unidad', 18.50, 10.50, 25, 8, 'E-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000025', 'FE-EL-004',
    'Interruptor sencillo',
    'Interruptor de luz sencillo, 10A 125V, color marfil.',
    'a0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002',
    'unidad', 14.00, 8.00, 20, 8, 'E-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000026', 'FE-EL-005',
    'Cinta aislante 3/4" (rollo)',
    'Cinta aislante negra de PVC 3/4"×20m, 600V, temperatura -10°C a 80°C.',
    'a0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002',
    'rollo', 8.00, 4.50, 15, 6, 'E-03', true
  ),

  -- ── Pintura y Acabados ────────────────────────────────────
  (
    'd0000000-0000-0000-0000-000000000027', 'FE-PI-001',
    'Pintura látex blanca (galón)',
    'Pintura de agua látex blanca interior/exterior, alto rendimiento ~40 m² por galón.',
    'a0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001',
    'galón', 98.00, 62.00, 10, 4, 'F-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000028', 'FE-PI-002',
    'Brocha de cerda 3"',
    'Brocha 3 pulgadas, cerda de nylon resistente al solvente, mango madera lacado.',
    'a0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 22.00, 13.00, 12, 5, 'F-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000029', 'FE-PI-003',
    'Rodillo de espuma 9"',
    'Rodillo para pintura 9 pulgadas, espuma de alta densidad, estructura plástica.',
    'a0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 18.00, 10.00, 8, 4, 'F-03', true
  ),
  (
    'd0000000-0000-0000-0000-000000000030', 'FE-PI-004',
    'Thinner corriente (galón)',
    'Solvente diluyente para pinturas base solvente y esmaltes. Galón.',
    'a0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001',
    'galón', 45.00, 28.00, 7, 3, 'F-01', true
  ),

  -- ── Construcción ──────────────────────────────────────────
  (
    'd0000000-0000-0000-0000-000000000031', 'FE-CO-001',
    'Cemento Portland (saco 42.5 kg)',
    'Cemento gris tipo Portland I, saco de 42.5 kg. Resistencia 28 días: 280 kg/cm².',
    'a0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000004',
    'saco', 75.00, 52.00, 0, 20, 'G-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000032', 'FE-CO-002',
    'Block de concreto 15×20×40 cm',
    'Block estándar de concreto, densidad normal, resistencia 35 kg/cm². Por unidad.',
    'a0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000004',
    'unidad', 5.50, 3.50, 120, 50, 'G-02', true
  ),

  -- ── Seguridad y EPI ───────────────────────────────────────
  (
    'd0000000-0000-0000-0000-000000000033', 'FE-SE-001',
    'Casco de seguridad tipo I',
    'Casco dieléctrico clase E, tipo I, con suspensión de 4 puntos, color amarillo.',
    'a0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 65.00, 38.00, 7, 3, 'H-01', true
  ),
  (
    'd0000000-0000-0000-0000-000000000034', 'FE-SE-002',
    'Guantes de cuero talla M',
    'Guantes de protección en cuero flor, talla M, palma reforzada, puño corto.',
    'a0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001',
    'par', 28.00, 16.00, 2, 6, 'H-02', true
  ),
  (
    'd0000000-0000-0000-0000-000000000035', 'FE-SE-003',
    'Lentes de seguridad transparentes',
    'Lentes de seguridad policarbonato transparente, resistencia ANSI Z87.1.',
    'a0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001',
    'unidad', 22.00, 12.50, 10, 4, 'H-03', true
  );


-- ============================================================
-- VALORES DE CAMPOS PERSONALIZADOS
-- ============================================================

INSERT INTO public.product_custom_values (product_id, field_id, value) VALUES
  -- Martillo
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Stanley'),
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Acero'),
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '12'),
  -- Desarmador plano
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Stanley'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Acero'),
  -- Desarmador Phillips
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Irwin'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'Acero'),
  -- Alicate
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Truper'),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'Acero'),
  -- Llave ajustable
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'Urrea'),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'Acero inoxidable'),
  -- Taladro
  ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'Bosch'),
  ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000003', '24'),
  -- Pulidora
  ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001', 'DeWalt'),
  ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000003', '12'),
  -- Casco
  ('d0000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000001', 'Urrea'),
  ('d0000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000002', 'Plástico'),
  -- Guantes
  ('d0000000-0000-0000-0000-000000000034', 'c0000000-0000-0000-0000-000000000002', 'Cuero'),
  -- Lentes
  ('d0000000-0000-0000-0000-000000000035', 'c0000000-0000-0000-0000-000000000002', 'Plástico')

ON CONFLICT (product_id, field_id) DO NOTHING;


-- ============================================================
-- MOVIMIENTOS DE STOCK
-- Requiere al menos un usuario admin registrado.
-- ============================================================

DO $$
DECLARE
  v_uid uuid;
  t     timestamptz;
BEGIN
  SELECT id INTO v_uid FROM public.profiles WHERE role = 'admin' LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE '⚠ No se encontró un usuario administrador. Saltando movimientos de stock.';
    RETURN;
  END IF;

  -- Alias corto para fechas relativas
  t := NOW();

  -- ── Entradas iniciales (compras de apertura) ─────────────
  INSERT INTO public.stock_movements
    (product_id, user_id, type, quantity, previous_stock, new_stock, reason, notes, created_at)
  VALUES
    ('d0000000-0000-0000-0000-000000000001', v_uid, 'entrada', 20,  0, 20,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000002', v_uid, 'entrada', 35,  0, 35,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000003', v_uid, 'entrada', 35,  0, 35,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000004', v_uid, 'entrada', 15,  0, 15,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000005', v_uid, 'entrada', 10,  0, 10,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000006', v_uid, 'entrada', 8,   0, 8,   'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000007', v_uid, 'entrada', 25,  0, 25,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000008', v_uid, 'entrada', 10,  0, 10,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000009', v_uid, 'entrada', 5,   0, 5,   'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000010', v_uid, 'entrada', 4,   0, 4,   'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '30 days'),
    ('d0000000-0000-0000-0000-000000000011', v_uid, 'entrada', 80,  0, 80,  'Compra inicial', 'Factura 0010 - ProFerro Central',           t - interval '28 days'),
    ('d0000000-0000-0000-0000-000000000012', v_uid, 'entrada', 100, 0, 100, 'Compra inicial', 'Factura 0010 - ProFerro Central',           t - interval '28 days'),
    ('d0000000-0000-0000-0000-000000000013', v_uid, 'entrada', 40,  0, 40,  'Compra inicial', 'Factura 0010 - ProFerro Central',           t - interval '28 days'),
    ('d0000000-0000-0000-0000-000000000014', v_uid, 'entrada', 40,  0, 40,  'Compra inicial', 'Factura 0010 - ProFerro Central',           t - interval '28 days'),
    ('d0000000-0000-0000-0000-000000000016', v_uid, 'entrada', 30,  0, 30,  'Compra inicial', 'Factura 0022 - Importaciones Técnicas GT',  t - interval '25 days'),
    ('d0000000-0000-0000-0000-000000000017', v_uid, 'entrada', 20,  0, 20,  'Compra inicial', 'Factura 0022 - Importaciones Técnicas GT',  t - interval '25 days'),
    ('d0000000-0000-0000-0000-000000000018', v_uid, 'entrada', 60,  0, 60,  'Compra inicial', 'Factura 0022 - Importaciones Técnicas GT',  t - interval '25 days'),
    ('d0000000-0000-0000-0000-000000000019', v_uid, 'entrada', 50,  0, 50,  'Compra inicial', 'Factura 0022 - Importaciones Técnicas GT',  t - interval '25 days'),
    ('d0000000-0000-0000-0000-000000000022', v_uid, 'entrada', 200, 0, 200, 'Compra inicial', 'Factura 0022 - Importaciones Técnicas GT',  t - interval '25 days'),
    ('d0000000-0000-0000-0000-000000000023', v_uid, 'entrada', 100, 0, 100, 'Compra inicial', 'Factura 0022 - Importaciones Técnicas GT',  t - interval '25 days'),
    ('d0000000-0000-0000-0000-000000000024', v_uid, 'entrada', 40,  0, 40,  'Compra inicial', 'Factura 0022 - Importaciones Técnicas GT',  t - interval '25 days'),
    ('d0000000-0000-0000-0000-000000000027', v_uid, 'entrada', 18,  0, 18,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '20 days'),
    ('d0000000-0000-0000-0000-000000000031', v_uid, 'entrada', 50,  0, 50,  'Compra inicial', 'Factura 0055 - Grupo Constructor Nacional', t - interval '20 days'),
    ('d0000000-0000-0000-0000-000000000032', v_uid, 'entrada', 200, 0, 200, 'Compra inicial', 'Factura 0055 - Grupo Constructor Nacional', t - interval '20 days'),
    ('d0000000-0000-0000-0000-000000000033', v_uid, 'entrada', 10,  0, 10,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '20 days'),
    ('d0000000-0000-0000-0000-000000000034', v_uid, 'entrada', 12,  0, 12,  'Compra inicial', 'Factura 0001 - Dist. Ferretera S.A.',       t - interval '20 days');

  -- ── Ventas / salidas ─────────────────────────────────────
  INSERT INTO public.stock_movements
    (product_id, user_id, type, quantity, previous_stock, new_stock, reason, notes, created_at)
  VALUES
    ('d0000000-0000-0000-0000-000000000001', v_uid, 'salida', 2,   20, 18,  'Venta al cliente', 'Cliente: Constructora Pérez',  t - interval '22 days'),
    ('d0000000-0000-0000-0000-000000000003', v_uid, 'salida', 15,  35, 20,  'Venta al cliente', NULL,                           t - interval '18 days'),
    ('d0000000-0000-0000-0000-000000000003', v_uid, 'salida', 10,  20, 10,  'Venta al cliente', NULL,                           t - interval '12 days'),
    ('d0000000-0000-0000-0000-000000000003', v_uid, 'salida', 7,   10, 3,   'Venta al cliente', NULL,                           t - interval '5 days'),
    ('d0000000-0000-0000-0000-000000000008', v_uid, 'salida', 6,   10, 4,   'Venta al cliente', NULL,                           t - interval '15 days'),
    ('d0000000-0000-0000-0000-000000000008', v_uid, 'salida', 2,   4,  2,   'Venta al cliente', NULL,                           t - interval '7 days'),
    ('d0000000-0000-0000-0000-000000000010', v_uid, 'salida', 3,   4,  1,   'Venta al cliente', 'Cliente: Taller El Volcán',    t - interval '10 days'),
    ('d0000000-0000-0000-0000-000000000011', v_uid, 'salida', 25,  80, 55,  'Venta al cliente', NULL,                           t - interval '20 days'),
    ('d0000000-0000-0000-0000-000000000011', v_uid, 'salida', 10,  55, 45,  'Venta al cliente', NULL,                           t - interval '8 days'),
    ('d0000000-0000-0000-0000-000000000012', v_uid, 'salida', 30,  100,70,  'Venta al cliente', NULL,                           t - interval '19 days'),
    ('d0000000-0000-0000-0000-000000000012', v_uid, 'salida', 10,  70, 60,  'Venta al cliente', NULL,                           t - interval '6 days'),
    ('d0000000-0000-0000-0000-000000000013', v_uid, 'salida', 10,  40, 30,  'Venta al cliente', NULL,                           t - interval '14 days'),
    ('d0000000-0000-0000-0000-000000000013', v_uid, 'salida', 5,   30, 25,  'Venta al cliente', NULL,                           t - interval '4 days'),
    ('d0000000-0000-0000-0000-000000000014', v_uid, 'salida', 20,  40, 20,  'Venta al cliente', NULL,                           t - interval '16 days'),
    ('d0000000-0000-0000-0000-000000000014', v_uid, 'salida', 17,  20, 3,   'Venta al cliente', NULL,                           t - interval '3 days'),
    ('d0000000-0000-0000-0000-000000000016', v_uid, 'salida', 8,   30, 22,  'Venta al cliente', 'Cliente: Proyecto Villa Flora', t - interval '12 days'),
    ('d0000000-0000-0000-0000-000000000017', v_uid, 'salida', 5,   20, 15,  'Venta al cliente', NULL,                           t - interval '9 days'),
    ('d0000000-0000-0000-0000-000000000018', v_uid, 'salida', 40,  60, 20,  'Venta al cliente', NULL,                           t - interval '11 days'),
    ('d0000000-0000-0000-0000-000000000018', v_uid, 'salida', 20,  20, 0,   'Venta al cliente', NULL,                           t - interval '2 days'),
    ('d0000000-0000-0000-0000-000000000022', v_uid, 'salida', 120, 200,80,  'Venta al cliente', 'Proyecto eléctrico residencial',t - interval '15 days'),
    ('d0000000-0000-0000-0000-000000000022', v_uid, 'salida', 80,  80, 0,   'Venta al cliente', NULL,                           t - interval '4 days'),
    ('d0000000-0000-0000-0000-000000000024', v_uid, 'salida', 15,  40, 25,  'Venta al cliente', NULL,                           t - interval '10 days'),
    ('d0000000-0000-0000-0000-000000000027', v_uid, 'salida', 8,   18, 10,  'Venta al cliente', NULL,                           t - interval '8 days'),
    ('d0000000-0000-0000-0000-000000000031', v_uid, 'salida', 50,  50, 0,   'Venta al cliente', 'Obra: Col. Las Flores',        t - interval '6 days'),
    ('d0000000-0000-0000-0000-000000000032', v_uid, 'salida', 80,  200,120, 'Venta al cliente', 'Obra: Col. Las Flores',        t - interval '6 days'),
    ('d0000000-0000-0000-0000-000000000034', v_uid, 'salida', 8,   12, 4,   'Venta al cliente', NULL,                           t - interval '7 days'),
    ('d0000000-0000-0000-0000-000000000034', v_uid, 'salida', 2,   4,  2,   'Venta al cliente', NULL,                           t - interval '1 day');

  -- ── Ajustes de inventario ────────────────────────────────
  INSERT INTO public.stock_movements
    (product_id, user_id, type, quantity, previous_stock, new_stock, reason, notes, created_at)
  VALUES
    ('d0000000-0000-0000-0000-000000000007', v_uid, 'ajuste', -5, 25, 20, 'Ajuste de inventario', 'Conteo físico: diferencia de 5 unidades', t - interval '3 days'),
    ('d0000000-0000-0000-0000-000000000015', v_uid, 'ajuste', -2, 22, 20, 'Ajuste de inventario', 'Conteo físico mensual',                    t - interval '3 days');

  RAISE NOTICE '✅ Movimientos de stock insertados correctamente para usuario %', v_uid;

END $$;


-- ============================================================
-- RESUMEN
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM public.categories  WHERE id::text LIKE 'a0000000%') AS categorias,
  (SELECT COUNT(*) FROM public.suppliers   WHERE id::text LIKE 'b0000000%') AS proveedores,
  (SELECT COUNT(*) FROM public.custom_fields WHERE id::text LIKE 'c0000000%') AS campos_personalizados,
  (SELECT COUNT(*) FROM public.products    WHERE sku LIKE 'FE-%')            AS productos,
  (SELECT COUNT(*) FROM public.product_custom_values
     WHERE product_id::text LIKE 'd0000000%')                                AS valores_de_campos,
  (SELECT COUNT(*) FROM public.stock_movements
     WHERE product_id::text LIKE 'd0000000%')                                AS movimientos;
