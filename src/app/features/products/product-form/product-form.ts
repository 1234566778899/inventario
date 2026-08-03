import { Component, inject, signal, OnInit, input } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DecimalPipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ProductsService } from '../../../core/services/products.service';
import { CategoriesService } from '../../../core/services/categories.service';
import { SuppliersService } from '../../../core/services/suppliers.service';
import { CustomFieldsService } from '../../../core/services/custom-fields.service';
import { Category, Supplier, CustomField, Product } from '../../../core/models';
import { MovementDialogComponent } from '../../../shared/movement-dialog/movement-dialog';
import { CategoryDialogComponent } from '../../categories/category-dialog/category-dialog';
import { SupplierDialogComponent } from '../../suppliers/supplier-dialog/supplier-dialog';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    DecimalPipe,
  ],
  templateUrl: './product-form.html',
  styleUrl: './product-form.scss',
})
export class ProductFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly customFieldsService = inject(CustomFieldsService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  // Route param injected via withComponentInputBinding
  readonly id = input<string | undefined>(undefined);

  protected readonly loading       = signal(true);
  protected readonly saving        = signal(false);
  protected readonly errorMessage  = signal('');
  protected readonly isEdit        = signal(false);
  protected readonly existingProduct = signal<Product | null>(null);

  protected readonly imageFile     = signal<File | null>(null);
  protected readonly imagePreview  = signal<string | null>(null);
  protected readonly isDragging    = signal(false);
  private removeImageUrl           = false;

  protected categories: Category[] = [];
  protected suppliers: Supplier[] = [];
  protected customFields: CustomField[] = [];

  protected readonly form = this.fb.nonNullable.group({
    sku:           ['', Validators.required],
    name:          ['', Validators.required],
    description:   [''],
    category_id:   [''],
    supplier_id:   [''],
    unit:          ['unidad', Validators.required],
    price:         [0, [Validators.required, Validators.min(0)]],
    cost:          [0, [Validators.required, Validators.min(0)]],
    stock_current: [0, [Validators.required, Validators.min(0)]],
    stock_minimum: [0, [Validators.required, Validators.min(0)]],
    location:      [''],
    is_active:     [true],
  });

  // Dynamic custom fields form values
  protected customValues: Record<string, string> = {};

  async ngOnInit(): Promise<void> {
    const productId = this.id();
    this.isEdit.set(!!productId);

    const [cats, sups, fields] = await Promise.all([
      this.categoriesService.getAll(),
      this.suppliersService.getAll(),
      this.customFieldsService.getAll(),
    ]);

    this.categories = cats;
    this.suppliers = sups;
    this.customFields = fields;

    if (productId) {
      const product = await this.productsService.getById(productId);
      this.existingProduct.set(product);
      this.form.patchValue({
        sku:           product.sku,
        name:          product.name,
        description:   product.description ?? '',
        category_id:   product.category_id ?? '',
        supplier_id:   product.supplier_id ?? '',
        unit:          product.unit,
        price:         product.price,
        cost:          product.cost,
        stock_current: product.stock_current,
        stock_minimum: product.stock_minimum,
        location:      product.location ?? '',
        is_active:     product.is_active,
      });

      // Load custom values
      if (product.custom_values) {
        for (const cv of product.custom_values) {
          this.customValues[cv.field_id] = cv.value ?? '';
        }
      }
    }

    this.loading.set(false);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const raw = this.form.getRawValue();
    const payload = {
      sku:           raw.sku,
      name:          raw.name,
      description:   raw.description || null,
      category_id:   raw.category_id || null,
      supplier_id:   raw.supplier_id || null,
      unit:          raw.unit,
      price:         raw.price,
      cost:          raw.cost,
      stock_current: raw.stock_current,
      stock_minimum: raw.stock_minimum,
      location:      raw.location || null,
      is_active:     raw.is_active,
    };

    const customPayload = Object.entries(this.customValues)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([field_id, value]) => ({ field_id, value }));

    let savedId: string;
    try {
      const productId = this.id();
      if (productId) {
        await this.productsService.update(productId, payload, customPayload);
        savedId = productId;
        this.snackBar.open('Producto actualizado correctamente', 'Cerrar', { duration: 3000 });
      } else {
        const created = await this.productsService.create(payload, customPayload);
        savedId = created.id;
        this.snackBar.open('Producto creado correctamente', 'Cerrar', { duration: 3000 });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar el producto';
      this.errorMessage.set(msg);
      this.saving.set(false);
      return;
    }

    // Image upload is non-fatal
    const imgFile = this.imageFile();
    if (imgFile) {
      try {
        const imageUrl = await this.productsService.uploadImage(imgFile, savedId);
        await this.productsService.update(savedId, { image_url: imageUrl });
      } catch (imgError: unknown) {
        const msg = (imgError as { message?: string })?.message
          ?? (imgError instanceof Error ? imgError.message : String(imgError));
        console.error('Image upload error:', imgError);
        this.snackBar.open(`No se pudo subir la imagen: ${msg}`, 'Cerrar', { duration: 8000 });
      }
    } else if (this.removeImageUrl) {
      await this.productsService.update(savedId, { image_url: null }).catch(() => {});
    }

    this.productsService.invalidateCache();
    this.saving.set(false);
    this.router.navigate(['/products']);
  }

  protected openMovementDialog(): void {
    const product = this.existingProduct();
    if (!product) return;

    const ref = this.dialog.open(MovementDialogComponent, {
      data: { product },
      width: '480px',
    });

    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (saved) {
        this.snackBar.open('Movimiento registrado', 'Cerrar', { duration: 3000 });
        // Reload to show updated stock
        const updated = await this.productsService.getById(product.id);
        this.existingProduct.set(updated);
        this.form.patchValue({ stock_current: updated.stock_current });
      }
    });
  }

  protected onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.setImageFile(file);
  }

  private setImageFile(file: File): void {
    if (!file.type.startsWith('image/')) return;
    this.imageFile.set(file);
    this.removeImageUrl = false;
    const reader = new FileReader();
    reader.onload = e => this.imagePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  protected removeImage(): void {
    this.imageFile.set(null);
    this.imagePreview.set(null);
    this.removeImageUrl = true;
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setImageFile(file);
  }

  protected openCreateCategory(event: MouseEvent): void {
    event.stopPropagation();
    const ref = this.dialog.open(CategoryDialogComponent, {
      width: '480px',
      data: {},
    });
    ref.afterClosed().subscribe((saved: Category | false) => {
      if (saved) {
        this.categories = [...this.categories, saved].sort((a, b) => a.name.localeCompare(b.name));
        this.form.patchValue({ category_id: saved.id });
      }
    });
  }

  protected openCreateSupplier(event: MouseEvent): void {
    event.stopPropagation();
    const ref = this.dialog.open(SupplierDialogComponent, {
      width: '520px',
      data: {},
    });
    ref.afterClosed().subscribe((saved: Supplier | false) => {
      if (saved) {
        this.suppliers = [...this.suppliers, saved].sort((a, b) => a.name.localeCompare(b.name));
        this.form.patchValue({ supplier_id: saved.id });
      }
    });
  }

  protected cancel(): void {
    this.router.navigate(['/products'], { state: { skipReload: true } });
  }

  protected getCustomFieldValue(fieldId: string): string {
    return this.customValues[fieldId] ?? '';
  }

  protected setCustomFieldValue(fieldId: string, value: string): void {
    this.customValues[fieldId] = value;
  }
}
