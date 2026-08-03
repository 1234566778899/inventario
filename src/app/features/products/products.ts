import {
  Component, inject, signal, OnInit, ViewChild
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { CurrencyPipe, SlicePipe } from '@angular/common';
import { ProductsService } from '../../core/services/products.service';
import { ColumnPreferencesService } from '../../core/services/column-preferences.service';
import { CustomFieldsService } from '../../core/services/custom-fields.service';
import { AuthService } from '../../core/services/auth.service';
import { Product, ColumnConfig, CustomField } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { MovementDialogComponent } from '../../shared/movement-dialog/movement-dialog';
import { CustomFieldsDialogComponent, CustomFieldsDialogResult } from '../../shared/custom-fields-dialog/custom-fields-dialog';
import { ProductDetailDialogComponent } from '../../shared/product-detail-dialog/product-detail-dialog';
import { ColumnConfigDialogComponent } from '../../shared/column-config-dialog/column-config-dialog';

const ALL_COLUMNS: ColumnConfig[] = [
  { id: 'image',         label: 'Imagen',         visible: true,  order: 0 },
  { id: 'sku',           label: 'SKU',            visible: true,  order: 1 },
  { id: 'name',          label: 'Nombre',         visible: true,  order: 2 },
  { id: 'category',      label: 'Categoría',      visible: true,  order: 3 },
  { id: 'supplier',      label: 'Proveedor',      visible: false, order: 4 },
  { id: 'unit',          label: 'Unidad',         visible: false, order: 5 },
  { id: 'price',         label: 'Precio',         visible: true,  order: 6 },
  { id: 'cost',          label: 'Costo',          visible: false, order: 7 },
  { id: 'stock_current', label: 'Stock Actual',   visible: true,  order: 8 },
  { id: 'stock_minimum', label: 'Stock Mínimo',   visible: true,  order: 9 },
  { id: 'location',      label: 'Ubicación',      visible: false, order: 10 },
  { id: 'is_active',     label: 'Estado',         visible: true,  order: 11 },
  { id: 'actions',       label: 'Acciones',       visible: true,  order: 12 },
];

const TABLE_NAME = 'products';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatTooltipModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatMenuModule,
    MatDividerModule,
    CurrencyPipe,
    SlicePipe,
  ],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class ProductsComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly columnPrefsService = inject(ColumnPreferencesService);
  private readonly customFieldsService = inject(CustomFieldsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  @ViewChild(MatSort) set matSort(sort: MatSort | undefined) {
    if (sort) this.dataSource.sort = sort;
  }
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  protected readonly loading = signal(true);
  protected readonly totalCount = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  protected readonly dataSource = new MatTableDataSource<Product>([]);
  protected columns: ColumnConfig[] = ALL_COLUMNS.map(c => ({ ...c }));
  protected customFields: CustomField[] = [];
  protected searchValue = '';
  protected deletingId: string | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected get displayedColumns(): string[] {
    const sorted = this.columns
      .filter(c => c.visible && c.id !== 'actions')
      .sort((a, b) => a.order - b.order)
      .map(c => c.id);
    if (this.columns.some(c => c.id === 'actions' && c.visible)) {
      sorted.push('actions');
    }
    return sorted;
  }

  async ngOnInit(): Promise<void> {
    const skipReload = (window.history.state as Record<string, unknown>)?.['skipReload'] === true;

    await this.loadColumnPrefs();

    if (skipReload) {
      const cached = this.productsService.getCached();
      if (cached) {
        this.dataSource.data = cached.data;
        this.totalCount.set(cached.count);
        this.loading.set(false);
        return;
      }
    }

    await this.loadProducts();
  }

  private async loadColumnPrefs(): Promise<void> {
    // Load both custom fields and saved prefs in parallel
    const [fields, saved] = await Promise.all([
      this.customFieldsService.getAll(),
      this.columnPrefsService.get(TABLE_NAME),
    ]);

    this.customFields = fields;

    // Build full column list: standard + one entry per custom field
    const cfColumns: ColumnConfig[] = fields.map((f, i) => ({
      id: `cf_${f.id}`,
      label: f.label,
      visible: true,
      order: ALL_COLUMNS.length + i,
    }));
    const allCols = [...ALL_COLUMNS.map(c => ({ ...c })), ...cfColumns];

    if (saved && saved.length > 0) {
      this.columns = allCols.map(col => {
        const s = saved.find(sc => sc.id === col.id);
        return s ? { ...col, visible: s.visible, order: s.order } : col;
      });
    } else {
      this.columns = allCols;
    }
  }

  protected getCustomValue(row: Product, fieldId: string): string {
    return row.custom_values?.find(cv => cv.field_id === fieldId)?.value ?? '—';
  }

  private async loadProducts(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading.set(true);
    try {
      const { data, count } = await this.productsService.getPage({
        page: this.pageIndex(),
        pageSize: this.pageSize(),
        search: this.searchValue || undefined,
      });
      this.dataSource.data = data;
      this.totalCount.set(count);
    } finally {
      if (showSpinner) this.loading.set(false);
    }
  }

  protected applyFilter(event: Event): void {
    this.searchValue = (event.target as HTMLInputElement).value.trim();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      this.pageIndex.set(0);
      await this.loadProducts(false);
    }, 350);
  }

  protected async onPage(event: PageEvent): Promise<void> {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    await this.loadProducts(false);
  }

  protected isLowStock(product: Product): boolean {
    return product.stock_current <= product.stock_minimum;
  }

  protected dragSourceCol: string | null = null;
  protected dragOverCol: string | null = null;

  protected onColDragStart(event: DragEvent, colId: string): void {
    this.dragSourceCol = colId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', colId);
    }
  }

  protected onColDragOver(event: DragEvent, colId: string): void {
    if (!this.dragSourceCol || this.dragSourceCol === colId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverCol = colId;
  }

  protected onColDragLeave(colId: string): void {
    if (this.dragOverCol === colId) this.dragOverCol = null;
  }

  protected async onColDrop(event: DragEvent, targetColId: string): Promise<void> {
    event.preventDefault();
    const source = this.dragSourceCol;
    this.dragSourceCol = null;
    this.dragOverCol = null;
    if (!source || source === targetColId) return;

    const displayed = [...this.displayedColumns];
    const fromIdx = displayed.indexOf(source);
    const toIdx = displayed.indexOf(targetColId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = displayed.splice(fromIdx, 1);
    displayed.splice(toIdx, 0, moved);

    // Reassign order across ALL columns (visible first, then hidden)
    let orderCounter = 0;
    displayed.forEach(id => {
      const col = this.columns.find(c => c.id === id);
      if (col) col.order = orderCounter++;
    });
    this.columns.filter(c => !c.visible).forEach(col => {
      col.order = orderCounter++;
    });

    await this.columnPrefsService.save(TABLE_NAME, this.columns);
  }

  protected onColDragEnd(): void {
    this.dragSourceCol = null;
    this.dragOverCol = null;
  }

  protected openColumnConfig(): void {
    const ref = this.dialog.open(ColumnConfigDialogComponent, {
      width: '400px',
      data: { columns: this.columns.filter(c => c.id !== 'actions').map(c => ({ ...c })) },
    });
    ref.afterClosed().subscribe(async (result: ColumnConfig[] | null) => {
      if (result) {
        this.columns = [...result, this.columns.find(c => c.id === 'actions')!];
        await this.columnPrefsService.save(TABLE_NAME, this.columns);
      }
    });
  }

  protected openCustomFields(): void {
    const ref = this.dialog.open(CustomFieldsDialogComponent, {
      width: '560px',
      data: { columns: this.columns.map(c => ({ ...c })) },
    });
    ref.afterClosed().subscribe(async (result: CustomFieldsDialogResult | undefined) => {
      if (result?.columns) {
        await this.columnPrefsService.save(TABLE_NAME, result.columns);
      }
      // Always reload to pick up any added/removed custom fields
      await this.loadColumnPrefs();
    });
  }

  protected async exportCSV(): Promise<void> {
    try {
      const rows = await this.productsService.getAllFiltered(this.searchValue || undefined);
      const headers = ['SKU', 'Nombre', 'Categoría', 'Proveedor', 'Precio (S/)', 'Costo (S/)', 'Stock', 'Mínimo', 'Ubicación', 'Estado'];
      const escape = (v: string | number | null | undefined) =>
        typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : (v ?? '');
      const lines = [
        headers.join(','),
        ...rows.map(p => [
          escape(p.sku), escape(p.name),
          escape(p.category?.name), escape(p.supplier?.name),
          p.price, p.cost, p.stock_current, p.stock_minimum,
          escape(p.location), p.is_active ? 'Activo' : 'Inactivo',
        ].join(',')),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `productos_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      this.snackBar.open('Error al exportar productos', 'Cerrar', { duration: 3000 });
    }
  }

  protected viewProduct(product: Product): void {
    this.dialog.open(ProductDetailDialogComponent, {
      data: { product, customFields: this.customFields },
      width: '600px',
      maxWidth: '95vw',
    });
  }

  protected openMovementDialog(product: Product): void {
    const ref = this.dialog.open(MovementDialogComponent, {
      data: { product },
      width: '480px',
    });
    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (saved) {
        this.snackBar.open('Movimiento registrado correctamente', 'Cerrar', { duration: 3000 });
        await this.loadProducts();
      }
    });
  }

  protected editProduct(id: string): void {
    this.router.navigate(['/products', id, 'edit']);
  }

  protected async deleteProduct(product: Product): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar producto',
        message: `¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        color: 'warn',
      },
    });
    ref.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) return;
      try {
        await this.productsService.delete(product.id);
        this.productsService.invalidateCache();

        // Animate out then remove from local data
        this.deletingId = product.id;
        await new Promise(r => setTimeout(r, 300));
        this.deletingId = null;
        this.dataSource.data = this.dataSource.data.filter(p => p.id !== product.id);
        this.totalCount.update(n => Math.max(0, n - 1));

        this.snackBar.open('Producto eliminado', 'Cerrar', { duration: 3000 });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error al eliminar';
        this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
      }
    });
  }
}
