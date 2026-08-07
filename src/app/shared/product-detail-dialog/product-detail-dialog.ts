import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CurrencyPipe, DecimalPipe, DatePipe } from '@angular/common';
import { ProductsService } from '../../core/services/products.service';
import { CategoriesService } from '../../core/services/categories.service';
import { SuppliersService } from '../../core/services/suppliers.service';
import { MovementsService } from '../../core/services/movements.service';
import { AuthService } from '../../core/services/auth.service';
import {
  Product, CustomField, Category, Supplier, StockMovement, MovementType,
} from '../../core/models';
import { MovementDialogComponent } from '../movement-dialog/movement-dialog';
import { MovementDeltaPipe, MovementDeltaClassPipe } from '../pipes/movement-delta.pipe';

interface DetailDialogData {
  product: Product;
  customFields: CustomField[];
}

/** Which editor a row renders once it is clicked. */
type EditorKind = 'text' | 'textarea' | 'number' | 'money' | 'select' | 'date' | 'boolean';

@Component({
  selector: 'app-product-detail-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    CurrencyPipe,
    DecimalPipe,
    DatePipe,
    MovementDeltaPipe,
    MovementDeltaClassPipe,
  ],
  templateUrl: './product-detail-dialog.html',
  styleUrl: './product-detail-dialog.scss',
})
export class ProductDetailDialogComponent implements OnInit {
  private readonly dialogData = inject<DetailDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ProductDetailDialogComponent>);
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly movementsService = inject(MovementsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);

  protected readonly data = signal<Product>({ ...this.dialogData.product });
  protected readonly customFields = this.dialogData.customFields;

  protected categories: Category[] = [];
  protected suppliers: Supplier[] = [];
  protected readonly movements = signal<StockMovement[]>([]);
  protected readonly loadingMovements = signal(true);

  /** Key of the row currently being edited — only one at a time. */
  protected readonly editingKey = signal<string | null>(null);
  protected readonly savingKey = signal<string | null>(null);
  protected draft: string | number | boolean | null = null;
  /** Set when the product changed, so the list behind can refresh on close. */
  private dirty = false;

  protected readonly units = ['Unidad', 'Caja', 'Metro', 'Kilogramo', 'Litro', 'Galón', 'Rollo', 'Bolsa', 'Par', 'Juego'];

  get canEdit(): boolean {
    return this.auth.isAdmin();
  }

  async ngOnInit(): Promise<void> {
    void Promise.all([
      this.categoriesService.getAll(),
      this.suppliersService.getAll(),
    ]).then(([categories, suppliers]) => {
      this.categories = categories;
      this.suppliers = suppliers;
    });

    await this.loadMovements();
  }

  private async loadMovements(): Promise<void> {
    this.loadingMovements.set(true);
    try {
      this.movements.set(await this.movementsService.getAll(this.data().id));
    } catch {
      this.movements.set([]);
    } finally {
      this.loadingMovements.set(false);
    }
  }

  // ── Inline editing ─────────────────────────────────────────────────────────

  protected startEdit(key: string, current: string | number | boolean | null): void {
    if (!this.canEdit || this.savingKey()) return;
    this.editingKey.set(key);
    this.draft = current;
  }

  protected cancelEdit(): void {
    this.editingKey.set(null);
    this.draft = null;
  }

  /**
   * Writes a single column. Only the touched field is sent, so two people
   * editing different fields of the same product do not overwrite each other.
   */
  protected async commit(key: string): Promise<void> {
    const product = this.data();
    const current = (product as unknown as Record<string, unknown>)[key];
    const next = this.normalise(key, this.draft);

    if (next === current) { this.cancelEdit(); return; }

    // Required text fields must not be blanked out by an empty input.
    if ((key === 'name' || key === 'sku') && !String(next ?? '').trim()) {
      this.snackBar.open('Este campo no puede quedar vacío', 'Cerrar', { duration: 3000 });
      this.cancelEdit();
      return;
    }

    this.savingKey.set(key);
    this.editingKey.set(null);
    try {
      const updated = await this.productsService.update(product.id, { [key]: next });
      this.data.set(updated);
      this.dirty = true;
      this.productsService.invalidateCache();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar el cambio';
      this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
    } finally {
      this.savingKey.set(null);
      this.draft = null;
    }
  }

  private normalise(key: string, value: string | number | boolean | null): unknown {
    const numeric = ['price', 'cost', 'stock_minimum'];
    if (numeric.includes(key)) {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // Nullable text columns store null rather than an empty string.
      return trimmed === '' && key !== 'name' && key !== 'sku' ? null : trimmed;
    }
    return value;
  }

  /** Toggling active state saves straight away — no click-to-edit needed. */
  protected async toggleActive(value: boolean): Promise<void> {
    this.draft = value;
    await this.commit('is_active');
  }

  protected onEditorKey(event: KeyboardEvent, key: string): void {
    if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      void this.commit(key);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();   // keep Escape from closing the whole dialog
      this.cancelEdit();
    }
  }

  // ── Custom fields ──────────────────────────────────────────────────────────

  protected getCustomValue(fieldId: string): string {
    return this.data().custom_values?.find(cv => cv.field_id === fieldId)?.value ?? '';
  }

  protected editorForField(field: CustomField): EditorKind {
    return ({
      text: 'text', number: 'number', boolean: 'boolean',
      date: 'date', select: 'select',
    } as Record<string, EditorKind>)[field.field_type] ?? 'text';
  }

  protected async commitCustom(field: CustomField): Promise<void> {
    const key = `cf_${field.id}`;
    const value = this.draft === null || this.draft === undefined ? '' : String(this.draft);
    if (value === this.getCustomValue(field.id)) { this.cancelEdit(); return; }

    this.savingKey.set(key);
    this.editingKey.set(null);
    try {
      const updated = await this.productsService.update(
        this.data().id, {}, [{ field_id: field.id, value }]
      );
      this.data.set(updated);
      this.dirty = true;
      this.productsService.invalidateCache();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar el campo';
      this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
    } finally {
      this.savingKey.set(null);
      this.draft = null;
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  protected isLowStock(): boolean {
    return this.data().stock_current <= this.data().stock_minimum;
  }

  protected margin(): number {
    const p = this.data();
    if (!p.cost || !p.price) return 0;
    return ((p.price - p.cost) / p.price) * 100;
  }

  protected categoryName(): string {
    return this.data().category?.name
      ?? this.categories.find(c => c.id === this.data().category_id)?.name
      ?? '—';
  }

  protected supplierName(): string {
    return this.data().supplier?.name
      ?? this.suppliers.find(s => s.id === this.data().supplier_id)?.name
      ?? '—';
  }

  protected typeBadge(type: string): string {
    return { entrada: 'badge-success', salida: 'badge-danger', ajuste: 'badge-info' }[type] ?? 'badge-secondary';
  }

  protected typeLabel(type: string): string {
    return { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' }[type] ?? type;
  }

  // ── Stock ──────────────────────────────────────────────────────────────────

  /**
   * Stock is never edited inline: every change must leave a movement record,
   * otherwise the history stops reconciling with the on-hand count.
   */
  protected openMovement(defaultType?: MovementType): void {
    const ref = this.dialog.open(MovementDialogComponent, {
      data: { product: this.data(), defaultType },
      width: '480px',
    });
    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (!saved) return;
      this.dirty = true;
      this.productsService.invalidateCache();
      const fresh = await this.productsService.getById(this.data().id);
      this.data.set(fresh);
      await this.loadMovements();
    });
  }

  protected close(): void {
    this.dialogRef.close(this.dirty);
  }
}
