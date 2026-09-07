import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProductsService, ProductImportRow } from '../../../core/services/products.service';
import { CategoriesService } from '../../../core/services/categories.service';
import { SuppliersService } from '../../../core/services/suppliers.service';
import { Category, Supplier } from '../../../core/models';
import { stripBom } from '../../../core/utils/csv';

type Step = 'file' | 'map' | 'result';

/** Campos de la base a los que se puede vincular una columna del archivo. */
interface TargetField {
  key: string;
  label: string;
  hint: string;
  required?: boolean;
  kind: 'text' | 'number' | 'bool' | 'ref';
}

const TARGET_FIELDS: TargetField[] = [
  { key: 'sku',           label: 'SKU',              hint: 'Código único',        required: true, kind: 'text' },
  { key: 'name',          label: 'Nombre',           hint: 'Nombre del producto', required: true, kind: 'text' },
  { key: 'description',   label: 'Descripción',      hint: 'Opcional',            kind: 'text' },
  { key: 'category',      label: 'Categoría',        hint: 'Se busca por nombre', kind: 'ref' },
  { key: 'supplier',      label: 'Proveedor',        hint: 'Se busca por nombre', kind: 'ref' },
  { key: 'unit',          label: 'Unidad de medida', hint: 'unidad, caja, metro…', kind: 'text' },
  { key: 'price',         label: 'Precio de venta',  hint: 'Número',              kind: 'number' },
  { key: 'cost',          label: 'Costo',            hint: 'Número',              kind: 'number' },
  { key: 'stock_current', label: 'Stock actual',     hint: 'Número',              kind: 'number' },
  { key: 'stock_minimum', label: 'Stock mínimo',     hint: 'Número',              kind: 'number' },
  { key: 'location',      label: 'Ubicación',        hint: 'Pasillo, estante…',   kind: 'text' },
  { key: 'is_active',     label: 'Activo',           hint: 'Sí/No, 1/0, true/false', kind: 'bool' },
];

/** Encabezados típicos para adivinar la vinculación sola. */
const ALIASES: Record<string, string[]> = {
  sku:           ['sku', 'codigo', 'cod', 'clave', 'referencia', 'ref'],
  name:          ['nombre', 'producto', 'articulo', 'item', 'denominacion', 'descripcionproducto'],
  description:   ['descripcion', 'detalle', 'observacion', 'observaciones', 'nota', 'notas'],
  category:      ['categoria', 'rubro', 'familia', 'linea', 'grupo'],
  supplier:      ['proveedor', 'suministrador', 'distribuidor'],
  unit:          ['unidad', 'unidadmedida', 'unidaddemedida', 'um', 'medida', 'presentacion'],
  price:         ['precio', 'precioventa', 'preciodeventa', 'pventa', 'venta', 'pvp'],
  cost:          ['costo', 'preciocosto', 'preciocompra', 'preciodecompra', 'pcosto', 'pcompra', 'compra', 'costounitario'],
  stock_current: ['stock', 'stockactual', 'existencia', 'existencias', 'cantidad', 'saldo', 'inventario'],
  stock_minimum: ['stockminimo', 'stockmin', 'minimo', 'min', 'puntoreorden'],
  location:      ['ubicacion', 'localizacion', 'bodega', 'almacen', 'pasillo', 'estante', 'anaquel'],
  is_active:     ['activo', 'estado', 'habilitado', 'vigente'],
};

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Importación de productos desde Excel/CSV, presentada en la misma hoja lateral
 * (con orejita) que el formulario de producto. Tres pasos: archivo → vincular
 * columnas → resultado.
 */
@Component({
  selector: 'app-product-import',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './product-import.html',
  styleUrl: './product-import.scss',
})
export class ProductImportComponent {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly dialogRef = inject(MatDialogRef<ProductImportComponent, boolean>);

  protected readonly targets = TARGET_FIELDS;
  protected readonly step = signal<Step>('file');
  protected readonly parsing = signal(false);
  protected readonly importing = signal(false);
  protected readonly error = signal('');
  protected readonly fileName = signal('');
  /** Solo se muestra cuando el libro tiene más de una hoja. */
  protected readonly sheetName = signal('');
  protected readonly isDragging = signal(false);

  /** Encabezados detectados en el archivo. */
  protected readonly headers = signal<string[]>([]);
  /** Filas de datos, ya como texto. */
  private rows: string[][] = [];
  protected readonly rowCount = signal(0);

  /** targetKey → índice de columna del archivo (-1 = no importar). */
  protected mapping: Record<string, number> = {};

  protected createMissingRefs = true;
  protected onlyNew = false;

  private categories: Category[] = [];
  private suppliers: Supplier[] = [];
  private existingSkus = new Set<string>();

  protected readonly progress = signal(0);
  protected readonly result = signal<{
    ok: number; created: number; updated: number; skipped: number;
    failed: { sku: string; message: string }[];
    newCategories: string[]; newSuppliers: string[];
  } | null>(null);

  // ── Paso 1: archivo ────────────────────────────────────────────────────────

  protected onDragOver(e: DragEvent): void { e.preventDefault(); this.isDragging.set(true); }
  protected onDragLeave(e: DragEvent): void { e.preventDefault(); this.isDragging.set(false); }
  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void this.loadFile(file);
  }
  protected onFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void this.loadFile(file);
  }

  private async loadFile(file: File): Promise<void> {
    this.error.set('');
    this.parsing.set(true);
    this.fileName.set(file.name);

    try {
      const isCsv = /\.csv$/i.test(file.name);
      const table = isCsv
        ? this.parseCsv(stripBom(await file.text()))
        : await this.parseXlsx(file);

      const clean = table.filter(r => r.some(c => String(c ?? '').trim() !== ''));
      if (clean.length < 2) {
        throw new Error('El archivo no tiene encabezados y al menos una fila de datos.');
      }

      const headers = clean[0].map((h, i) => String(h ?? '').trim() || `Columna ${i + 1}`);
      this.headers.set(headers);
      this.rows = clean.slice(1).map(r => headers.map((_, i) => String(r[i] ?? '').trim()));
      this.rowCount.set(this.rows.length);
      this.autoMap(headers);

      // Se cargan en segundo plano; hacen falta recién al importar.
      const [cats, sups, products] = await Promise.all([
        this.categoriesService.getAll(),
        this.suppliersService.getAll(),
        this.productsService.getAll(),
      ]);
      this.categories = cats;
      this.suppliers = sups;
      this.existingSkus = new Set(products.map(p => p.sku.trim().toLowerCase()));

      this.step.set('map');
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
      this.fileName.set('');
    } finally {
      this.parsing.set(false);
    }
  }

  /** La librería se carga bajo demanda para no engordar el bundle inicial. */
  private async parseXlsx(file: File): Promise<string[][]> {
    const readXlsxFile = (await import('read-excel-file/browser')).default;
    const sheets = await readXlsxFile(file);

    const sheet = sheets.find(s => s.data.length > 0);
    if (!sheet) throw new Error('El archivo no tiene ninguna hoja con datos.');
    this.sheetName.set(sheets.length > 1 ? sheet.sheet : '');

    const toText = (cell: unknown): string => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell);
    };
    return sheet.data.map(row => row.map(toText));
  }

  private parseCsv(text: string): string[][] {
    const firstLine = text.split(/\r?\n/)[0] ?? '';
    const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /**
   * Adivina la vinculación puntuando cada par (campo, columna) y asignando de
   * mayor a menor puntaje. Hacerlo global en vez de "primera coincidencia" evita
   * que un encabezado como "Stock Mín." se lo lleve `stock` por ser más corto.
   */
  private autoMap(headers: string[]): void {
    const normalized = headers.map(normalize);
    this.mapping = {};
    for (const t of TARGET_FIELDS) this.mapping[t.key] = -1;

    const pairs: { field: string; col: number; score: number }[] = [];
    for (const target of TARGET_FIELDS) {
      normalized.forEach((header, col) => {
        let score = 0;
        for (const alias of ALIASES[target.key] ?? []) {
          if (header === alias) score = Math.max(score, 100 + alias.length);
          else if (header.startsWith(alias) || alias.startsWith(header)) {
            score = Math.max(score, 60 + alias.length);
          } else if (alias.length >= 5 && header.includes(alias)) {
            // El umbral de 5 evita que trozos cortos como "min" enganchen de más.
            score = Math.max(score, 30 + alias.length);
          }
        }
        if (score > 0) pairs.push({ field: target.key, col, score });
      });
    }

    pairs.sort((a, b) => b.score - a.score);
    const usedCols = new Set<number>();
    const usedFields = new Set<string>();
    for (const p of pairs) {
      if (usedFields.has(p.field) || usedCols.has(p.col)) continue;
      this.mapping[p.field] = p.col;
      usedFields.add(p.field);
      usedCols.add(p.col);
    }
  }

  // ── Paso 2: vincular ───────────────────────────────────────────────────────

  /** Primeras filas de la columna elegida, para confirmar de un vistazo. */
  protected sampleFor(targetKey: string): string {
    const idx = this.mapping[targetKey];
    if (idx === undefined || idx < 0) return '';
    return this.rows.slice(0, 3).map(r => r[idx]).filter(Boolean).join(' · ') || '(vacío)';
  }

  protected readonly mappedCount = computed(() => 0); // placeholder, ver countMapped()

  protected countMapped(): number {
    return Object.values(this.mapping).filter(i => i >= 0).length;
  }

  protected get missingRequired(): string[] {
    return TARGET_FIELDS.filter(t => t.required && (this.mapping[t.key] ?? -1) < 0).map(t => t.label);
  }

  protected get canImport(): boolean {
    return this.missingRequired.length === 0 && this.rowCount() > 0 && !this.importing();
  }

  /** Cuántas filas actualizarían un producto ya existente. */
  protected get willUpdate(): number {
    const idx = this.mapping['sku'];
    if (idx < 0) return 0;
    return this.rows.filter(r => this.existingSkus.has((r[idx] ?? '').trim().toLowerCase())).length;
  }

  protected get willCreate(): number {
    return this.rowCount() - this.willUpdate;
  }

  protected back(): void {
    this.step.set('file');
    this.error.set('');
  }

  // ── Paso 3: importar ───────────────────────────────────────────────────────

  protected async runImport(): Promise<void> {
    this.importing.set(true);
    this.error.set('');
    this.progress.set(0);

    try {
      const catByName = new Map(this.categories.map(c => [normalize(c.name), c.id]));
      const supByName = new Map(this.suppliers.map(s => [normalize(s.name), s.id]));
      const newCategories: string[] = [];
      const newSuppliers: string[] = [];

      const cell = (row: string[], key: string): string => {
        const i = this.mapping[key];
        return i >= 0 ? (row[i] ?? '').trim() : '';
      };

      const payload: ProductImportRow[] = [];
      const failed: { sku: string; message: string }[] = [];
      let skipped = 0;

      for (const row of this.rows) {
        const sku = cell(row, 'sku');
        const name = cell(row, 'name');
        if (!sku || !name) {
          failed.push({ sku: sku || '(sin SKU)', message: 'Falta SKU o nombre' });
          continue;
        }
        if (this.onlyNew && this.existingSkus.has(sku.toLowerCase())) { skipped++; continue; }

        payload.push({
          sku,
          name,
          description: cell(row, 'description') || null,
          category_id: await this.resolveRef('category', row, catByName, newCategories),
          supplier_id: await this.resolveRef('supplier', row, supByName, newSuppliers),
          unit: cell(row, 'unit') || 'unidad',
          price: this.toNumber(cell(row, 'price')),
          cost: this.toNumber(cell(row, 'cost')),
          stock_current: this.toNumber(cell(row, 'stock_current')),
          stock_minimum: this.toNumber(cell(row, 'stock_minimum')),
          location: cell(row, 'location') || null,
          is_active: this.toBool(cell(row, 'is_active')),
        });
      }

      const updatedSkus = payload.filter(p => this.existingSkus.has(p.sku.toLowerCase())).length;

      const res = await this.productsService.importProducts(payload, done =>
        this.progress.set(Math.round((done / payload.length) * 100)));

      this.result.set({
        ok: res.ok,
        created: Math.max(0, res.ok - updatedSkus),
        updated: Math.min(res.ok, updatedSkus),
        skipped,
        failed: [...failed, ...res.failed],
        newCategories,
        newSuppliers,
      });
      this.step.set('result');
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Error durante la importación');
    } finally {
      this.importing.set(false);
    }
  }

  /** Busca la categoría/proveedor por nombre y, si se pidió, la crea. */
  private async resolveRef(
    key: 'category' | 'supplier',
    row: string[],
    index: Map<string, string>,
    created: string[],
  ): Promise<string | null> {
    const i = this.mapping[key];
    if (i < 0) return null;
    const raw = (row[i] ?? '').trim();
    if (!raw) return null;

    const hit = index.get(normalize(raw));
    if (hit) return hit;
    if (!this.createMissingRefs) return null;

    try {
      if (key === 'category') {
        const c = await this.categoriesService.create({ name: raw, description: null, parent_id: null });
        index.set(normalize(raw), c.id);
        created.push(raw);
        return c.id;
      }
      const s = await this.suppliersService.create({
        name: raw, contact_name: null, email: null, phone: null, address: null, notes: null,
      });
      index.set(normalize(raw), s.id);
      created.push(raw);
      return s.id;
    } catch {
      return null;
    }
  }

  /** Acepta "1.234,56", "1,234.56", "S/ 12" y demás formas del mundo real. */
  private toNumber(value: string): number {
    if (!value) return 0;
    let v = value.replace(/[^\d,.\-]/g, '');
    const lastComma = v.lastIndexOf(',');
    const lastDot = v.lastIndexOf('.');
    if (lastComma > lastDot) v = v.replace(/\./g, '').replace(',', '.');
    else v = v.replace(/,/g, '');
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private toBool(value: string): boolean {
    if (!value) return true; // por defecto los productos entran activos
    return !/^(no|false|0|inactivo|f|n)$/i.test(value.trim());
  }

  protected close(): void {
    this.dialogRef.close(this.result() !== null);
  }
}
