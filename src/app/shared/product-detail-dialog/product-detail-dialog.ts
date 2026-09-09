import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
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
import { ProductFormComponent } from '../../features/products/product-form/product-form';
import { productEditDialogConfig } from '../product-edit-dialog-config';
import { MovementDialogComponent } from '../movement-dialog/movement-dialog';
import { MovementDeltaPipe, MovementDeltaClassPipe } from '../pipes/movement-delta.pipe';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

interface DetailDialogData {
  product: Product;
  customFields: CustomField[];
}

@Component({
  selector: 'app-product-detail-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
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

  /** Newest movement, for the inventory card. The list arrives newest first. */
  protected readonly lastMovementAt = computed<string | null>(
    () => this.movements()[0]?.created_at ?? null
  );

  /** Set when the product changed, so the list behind can refresh on close. */
  private dirty = false;

  protected readonly savingAll = signal(false);

  protected readonly imageFile    = signal<File | null>(null);
  protected readonly imagePreview = signal<string | null>(null);
  protected readonly imageRemoved = signal(false);
  protected readonly imageStaged  = computed(() => this.imageFile() !== null || this.imageRemoved());

  /** Full-size viewer over the sheet. */
  protected readonly lightbox = signal(false);

  /** What the photo panel shows: the staged preview, else the saved photo. */
  protected readonly shownImage = computed<string | null>(() => {
    const preview = this.imagePreview();
    if (preview) return preview;
    if (this.imageRemoved()) return null;
    return this.view().image_url ?? null;
  });

  protected readonly view = this.data;
  protected readonly pendingCount = computed(() => this.imageStaged() ? 1 : 0);
  protected readonly hasPending = this.imageStaged;

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
      if (event.key !== 'Escape') return;
      // The viewer sits on top, so it is what Escape dismisses first — otherwise
      // opening a photo would make Escape close the whole sheet behind it.
      if (this.lightbox()) { this.closeLightbox(); return; }
      this.close();
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

  protected getCustomValue(fieldId: string): string {
    return this.data().custom_values?.find(cv => cv.field_id === fieldId)?.value ?? '';
  }

  protected onImageSelected(event: Event): void {
    if (!this.canEdit || this.savingAll()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset the input so picking the same file twice still fires a change event.
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    this.imageFile.set(file);
    this.imageRemoved.set(false);
    const reader = new FileReader();
    reader.onload = e => this.imagePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  protected openLightbox(): void {
    if (this.shownImage()) this.lightbox.set(true);
  }

  protected closeLightbox(): void {
    this.lightbox.set(false);
  }

  protected removeImage(): void {
    if (!this.canEdit || this.savingAll()) return;
    this.closeLightbox();
    this.imageFile.set(null);
    this.imagePreview.set(null);
    // Only a saved photo needs clearing; dropping an unsaved pick is not a change.
    this.imageRemoved.set(!!this.data().image_url);
  }

  protected async saveChanges(): Promise<void> {
    if (!this.canEdit || !this.hasPending() || this.savingAll()) return;

    this.savingAll.set(true);
    const payload: Partial<Product> = {};

    try {
      // Upload first: if storage rejects the file, nothing is written and the
      // edit stays staged, rather than saving a row that points at nothing.
      const file = this.imageFile();
      if (file) {
        payload['image_url'] = await this.productsService.uploadImage(file, this.data().id);
      } else if (this.imageRemoved()) {
        payload['image_url'] = null;
      }

      const updated = await this.productsService.update(this.data().id, payload);
      this.data.set(updated);

      this.clearStagedImage();
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

    this.clearStagedImage();
  }

  private clearStagedImage(): void {
    this.imageFile.set(null);
    this.imagePreview.set(null);
    this.imageRemoved.set(false);
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  /**
   * "unidad" → "unidades". Spanish pluralisation for the unit list this app
   * offers: vowel takes -s, -ón becomes -ones, anything else takes -es.
   */
  protected unitLabel(qty: number): string {
    const unit = this.view().unit ?? '';
    if (Math.abs(qty) === 1 || !unit) return unit;
    if (/ón$/i.test(unit)) return `${unit.slice(0, -2)}ones`;
    return /[aeiouáéíóú]$/i.test(unit) ? `${unit}s` : `${unit}es`;
  }

  protected isLowStock(): boolean {
    return this.view().stock_current <= this.view().stock_minimum;
  }

  protected margin(): number {
    const p = this.view();
    if (!p.cost || !p.price) return 0;
    return ((p.price - p.cost) / p.price) * 100;
  }

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

  /**
   * Hands off to the full form. Anything staged here would be lost on the way,
   * so it asks first — same contract as closing the sheet.
   */
  protected editProduct(): void {
    if (!this.canEdit || this.savingAll()) return;
    const go = () => {
      this.discardChanges();
      const ref = this.dialog.open(ProductFormComponent, {
        ...productEditDialogConfig,
        data: { id: this.data().id },
      });
      ref.afterClosed().subscribe(async (saved: boolean) => {
        if (!saved) return;
        this.dirty = true;
        try {
          this.data.set(await this.productsService.getById(this.data().id));
          await this.loadMovements();
        } catch {
          this.snackBar.open('No se pudo actualizar el detalle', 'Cerrar', { duration: 4000 });
        }
      });
    };

    if (!this.hasPending()) { go(); return; }

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Cambios sin guardar',
        message: 'Tienes cambios sin guardar en esta vista. Si abres el formulario se perderán.',
        confirmLabel: 'Descartar e ir al formulario',
        cancelLabel: 'Seguir aquí',
        color: 'warn',
      },
    });
    ref.afterClosed().subscribe((discard: boolean) => { if (discard) go(); });
  }

  protected close(): void {
    if (this.savingAll()) return;
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
