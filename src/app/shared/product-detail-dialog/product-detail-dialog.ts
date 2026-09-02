import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
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
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

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
  protected draft: string | number | boolean | null = null;
  /** Set when the product changed, so the list behind can refresh on close. */
  private dirty = false;

  // ── Staged edits ───────────────────────────────────────────────────────────
  // Nothing reaches the database until the floating bar is confirmed: edits pile
  // up here so a mistyped field can still be walked back.
  protected readonly pending       = signal<Record<string, unknown>>({});
  protected readonly pendingCustom = signal<Record<string, string>>({});
  protected readonly savingAll     = signal(false);

  /** Saved state with the staged edits painted on top — what the rows render. */
  protected readonly view = computed<Product>(
    () => ({ ...this.data(), ...this.pending() }) as Product
  );

  protected readonly pendingCount = computed(
    () => Object.keys(this.pending()).length + Object.keys(this.pendingCustom()).length
  );

  protected readonly hasPending = computed(() => this.pendingCount() > 0);

  /** Marks a row as edited-but-unsaved. Custom fields come in as `cf_<id>`. */
  protected isPending(key: string): boolean {
    return key.startsWith('cf_')
      ? key.slice(3) in this.pendingCustom()
      : key in this.pending();
  }

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

    // Escape and the backdrop must run the unsaved-changes guard rather than
    // dismissing the sheet straight away.
    this.dialogRef.disableClose = true;
    this.dialogRef.backdropClick().subscribe(() => this.close());
    this.dialogRef.keydownEvents().subscribe(event => {
      // Escape inside an inline editor stops propagation, so it never lands here.
      if (event.key === 'Escape') this.close();
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
    if (!this.canEdit || this.savingAll()) return;
    this.editingKey.set(key);
    this.draft = current;
  }

  protected cancelEdit(): void {
    this.editingKey.set(null);
    this.draft = null;
  }

  /**
   * Stages one column. Compared against the *saved* value, not the displayed
   * one, so typing a field back to how it started drops it from the pending set
   * instead of leaving a change that would save nothing.
   */
  protected stage(key: string): void {
    const saved = (this.data() as unknown as Record<string, unknown>)[key];
    const next = this.normalise(key, this.draft);

    // Required text fields must not be blanked out by an empty input.
    if ((key === 'name' || key === 'sku') && !String(next ?? '').trim()) {
      this.snackBar.open('Este campo no puede quedar vacío', 'Cerrar', { duration: 3000 });
      this.cancelEdit();
      return;
    }

    this.pending.update(current => {
      const draft = { ...current };
      if (next === saved) delete draft[key];
      else draft[key] = next;
      return draft;
    });

    this.cancelEdit();
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

  /** The switch stages like any other field — it no longer writes on its own. */
  protected toggleActive(value: boolean): void {
    this.draft = value;
    this.stage('is_active');
  }

  protected onEditorKey(event: KeyboardEvent, key: string): void {
    if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      this.stage(key);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();   // keep Escape from closing the whole dialog
      this.cancelEdit();
    }
  }

  // ── Custom fields ──────────────────────────────────────────────────────────

  /** Displayed value: the staged one when there is one, else what is saved. */
  protected getCustomValue(fieldId: string): string {
    return this.pendingCustom()[fieldId] ?? this.savedCustomValue(fieldId);
  }

  private savedCustomValue(fieldId: string): string {
    return this.data().custom_values?.find(cv => cv.field_id === fieldId)?.value ?? '';
  }

  protected editorForField(field: CustomField): EditorKind {
    return ({
      text: 'text', number: 'number', boolean: 'boolean',
      date: 'date', select: 'select',
    } as Record<string, EditorKind>)[field.field_type] ?? 'text';
  }

  protected stageCustom(field: CustomField): void {
    const value = this.draft === null || this.draft === undefined ? '' : String(this.draft);
    const saved = this.savedCustomValue(field.id);

    this.pendingCustom.update(current => {
      const draft = { ...current };
      if (value === saved) delete draft[field.id];
      else draft[field.id] = value;
      return draft;
    });

    this.cancelEdit();
  }

  // ── Saving ─────────────────────────────────────────────────────────────────

  /**
   * One round trip for every staged edit. Only the touched columns go up, so two
   * people editing different fields of the same product still do not clobber
   * each other.
   */
  protected async saveChanges(): Promise<void> {
    if (!this.hasPending() || this.savingAll()) return;

    this.savingAll.set(true);
    const payload = { ...this.pending() };
    const custom = Object.entries(this.pendingCustom())
      .map(([field_id, value]) => ({ field_id, value }));

    try {
      const updated = await this.productsService.update(this.data().id, payload, custom);
      this.data.set(updated);
      this.pending.set({});
      this.pendingCustom.set({});
      this.dirty = true;
      this.productsService.invalidateCache();
      this.snackBar.open('Cambios guardados', 'Cerrar', { duration: 3000 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudieron guardar los cambios';
      this.snackBar.open(msg, 'Cerrar', { duration: 6000 });
    } finally {
      this.savingAll.set(false);
    }
  }

  protected discardChanges(): void {
    this.pending.set({});
    this.pendingCustom.set({});
    this.cancelEdit();
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  protected isLowStock(): boolean {
    return this.view().stock_current <= this.view().stock_minimum;
  }

  protected margin(): number {
    const p = this.view();
    if (!p.cost || !p.price) return 0;
    return ((p.price - p.cost) / p.price) * 100;
  }

  // The embedded relation only describes the saved id, so a staged pick has to
  // be resolved against the loaded list instead.
  protected categoryName(): string {
    const id = this.view().category_id;
    if (!id) return '—';
    return this.categories.find(c => c.id === id)?.name
      ?? (id === this.data().category_id ? this.data().category?.name ?? '—' : '—');
  }

  protected supplierName(): string {
    const id = this.view().supplier_id;
    if (!id) return '—';
    return this.suppliers.find(s => s.id === id)?.name
      ?? (id === this.data().supplier_id ? this.data().supplier?.name ?? '—' : '—');
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
    if (!this.hasPending()) {
      this.dialogRef.close(this.dirty);
      return;
    }

    const n = this.pendingCount();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Cambios sin guardar',
        message: n === 1
          ? 'Tienes 1 cambio sin guardar. Si cierras ahora se perderá.'
          : `Tienes ${n} cambios sin guardar. Si cierras ahora se perderán.`,
        confirmLabel: 'Descartar y cerrar',
        cancelLabel: 'Seguir editando',
        color: 'warn',
      },
    });

    ref.afterClosed().subscribe((discard: boolean) => {
      if (discard) this.dialogRef.close(this.dirty);
    });
  }
}
