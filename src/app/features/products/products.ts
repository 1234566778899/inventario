import {
  Component, inject, signal, effect, OnInit, OnDestroy, ViewChild, HostListener
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { CurrencyPipe, SlicePipe } from '@angular/common';
import { ProductsService } from '../../core/services/products.service';
import { ColumnPreferencesService } from '../../core/services/column-preferences.service';
import { CustomFieldsService } from '../../core/services/custom-fields.service';
import { AuthService } from '../../core/services/auth.service';
import { CategoriesService } from '../../core/services/categories.service';
import { SuppliersService } from '../../core/services/suppliers.service';
import { ToolbarSearchService } from '../../core/services/toolbar-search.service';
import {
  Product, ColumnConfig, CustomField, MovementType,
  ProductFilters, EMPTY_PRODUCT_FILTERS, Category, Supplier,
} from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { MovementDialogComponent } from '../../shared/movement-dialog/movement-dialog';
import { CustomFieldsDialogComponent } from '../../shared/custom-fields-dialog/custom-fields-dialog';
import { ProductDetailDialogComponent } from '../../shared/product-detail-dialog/product-detail-dialog';
import { ProductFormComponent } from './product-form/product-form';

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

/** Matches .app-sidenav in layout.scss — the cover sheet stops here. */
const SIDENAV_WIDTH = 256;

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
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
    MatCheckboxModule,
    MatButtonToggleModule,
    CurrencyPipe,
    SlicePipe,
  ],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class ProductsComponent implements OnInit, OnDestroy {
  private readonly productsService = inject(ProductsService);
  private readonly columnPrefsService = inject(ColumnPreferencesService);
  private readonly customFieldsService = inject(CustomFieldsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly toolbarSearch = inject(ToolbarSearchService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  constructor() {
    this.toolbarSearch.configure({
      placeholder: 'Buscar (/) productos por nombre o SKU',
      onFilters: () => this.togglePanel(),
      onClear: () => void this.resetFilters(),
      primaryAction: {
        label: 'Nuevo Producto',
        icon: 'add',
        handler: () => this.newProduct(),
        hidden: () => !(this.auth.isAdmin() && this.auth.profileLoaded()),
      },
    });

    // Free-text search now lives in the app toolbar; react to it here, debounced.
    effect(() => {
      const term = this.toolbarSearch.query().trim();
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        if (term === this.searchValue) return;
        this.searchValue = term;
        this.draft.search = term;
        this.closePanel();
        this.pageIndex.set(0);
        void this.loadProducts(false);
      }, 350);
    });
  }

  ngOnDestroy(): void {
    this.toolbarSearch.reset();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  private syncToolbarFilters(): void {
    this.toolbarSearch.filterCount.set(this.activeChips.length);
  }

  /**
   * Sorting is delegated to the server. MatTableDataSource.sort would only order
   * the rows already fetched, which is a subset when paginating server-side.
   */
  @ViewChild(MatSort) set matSort(sort: MatSort | undefined) {
    if (!sort || this.sortBound) return;
    this.sortBound = true;
    sort.sortChange.subscribe(async (s: Sort) => {
      this.sortBy.set(s.direction ? s.active : 'name');
      this.sortDir.set(s.direction === 'desc' ? 'desc' : 'asc');
      this.pageIndex.set(0);
      await this.loadProducts(false);
    });
  }
  private sortBound = false;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  /** Escape closes the filter window without applying anything. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.panelOpen()) this.closePanel();
  }

  protected openPanel(): void {
    if (this.panelOpen()) return;
    this.draft = { ...this.appliedFilters, search: this.searchValue };
    this.panelOpen.set(true);
    this.toolbarSearch.filtersOpen.set(true);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.toolbarSearch.filtersOpen.set(false);
  }

  protected togglePanel(): void {
    this.panelOpen() ? this.closePanel() : this.openPanel();
  }

  protected readonly loading = signal(true);
  protected readonly totalCount = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  protected readonly sortBy = signal('name');
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');
  protected readonly dataSource = new MatTableDataSource<Product>([]);
  protected columns: ColumnConfig[] = ALL_COLUMNS.map(c => ({ ...c }));
  protected customFields: CustomField[] = [];
  protected searchValue = '';
  protected deletingId: string | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Advanced search panel ──────────────────────────────────────────────────
  protected readonly panelOpen = signal(false);
  protected categories: Category[] = [];
  protected suppliers: Supplier[] = [];

  /** Live edits in the panel; only copied into `appliedFilters` on "Buscar". */
  protected draft: ProductFilters = { ...EMPTY_PRODUCT_FILTERS };
  /** What the table is actually showing. */
  protected appliedFilters: ProductFilters = { ...EMPTY_PRODUCT_FILTERS };

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

    // Panel options load in the background — the table must not wait on them.
    void Promise.all([
      this.categoriesService.getAll(),
      this.suppliersService.getAll(),
    ]).then(([categories, suppliers]) => {
      this.categories = categories;
      this.suppliers = suppliers;
    });
  }

  private async loadColumnPrefs(): Promise<void> {
    // Load both custom fields and saved prefs in parallel
    const [fields, saved] = await Promise.all([
      this.customFieldsService.getAll(),
      this.columnPrefsService.get(TABLE_NAME),
    ]);

    this.customFields = fields;

    // Build full column list: standard + one entry per custom field
    // show_in_table controls the column; is_visible only governs the product
    // form. Falls back to is_visible until the migration adds the new column.
    const cfColumns: ColumnConfig[] = fields.map((f, i) => ({
      id: `cf_${f.id}`,
      label: f.label,
      visible: f.show_in_table ?? f.is_visible,
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
        filters: { ...this.appliedFilters, search: this.searchValue },
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
      });
      this.dataSource.data = data;
      this.totalCount.set(count);
    } finally {
      if (showSpinner) this.loading.set(false);
    }
  }

  /** Commits the draft and reloads — the filter window's "Aplicar" button. */
  protected async runSearch(): Promise<void> {
    this.appliedFilters = { ...this.draft };
    this.searchValue = this.draft.search.trim();
    this.toolbarSearch.query.set(this.searchValue);
    this.pageIndex.set(0);
    this.closePanel();
    await this.loadProducts(false);
    this.syncToolbarFilters();
  }

  /** Clears every field, including the free-text term. */
  protected async resetFilters(): Promise<void> {
    this.draft = { ...EMPTY_PRODUCT_FILTERS };
    this.appliedFilters = { ...EMPTY_PRODUCT_FILTERS };
    this.searchValue = '';
    this.toolbarSearch.query.set('');
    this.pageIndex.set(0);
    await this.loadProducts(false);
    this.syncToolbarFilters();
  }

  protected get hasActiveFilters(): boolean {
    return this.activeChips.length > 0;
  }

  /** Human-readable summary of what is filtering the table right now. */
  protected get activeChips(): { key: keyof ProductFilters; label: string }[] {
    const f = this.appliedFilters;
    const chips: { key: keyof ProductFilters; label: string }[] = [];

    if (f.categoryId) {
      const name = this.categories.find(c => c.id === f.categoryId)?.name ?? 'Categoría';
      chips.push({ key: 'categoryId', label: name });
    }
    if (f.supplierId) {
      const name = this.suppliers.find(s => s.id === f.supplierId)?.name ?? 'Proveedor';
      chips.push({ key: 'supplierId', label: name });
    }
    if (f.status !== 'all') {
      chips.push({ key: 'status', label: f.status === 'active' ? 'Activos' : 'Inactivos' });
    }
    if (f.lowStockOnly) chips.push({ key: 'lowStockOnly', label: 'Stock bajo' });
    if (f.location) chips.push({ key: 'location', label: `Ubicación: ${f.location}` });

    if (f.priceMin != null || f.priceMax != null) {
      chips.push({ key: 'priceMin', label: `Precio ${this.rangeLabel(f.priceMin, f.priceMax, 'S/ ')}` });
    }
    if (f.stockMin != null || f.stockMax != null) {
      chips.push({ key: 'stockMin', label: `Stock ${this.rangeLabel(f.stockMin, f.stockMax)}` });
    }

    return chips;
  }

  private rangeLabel(min: number | null, max: number | null, prefix = ''): string {
    if (min != null && max != null) return `${prefix}${min} – ${prefix}${max}`;
    if (min != null) return `≥ ${prefix}${min}`;
    return `≤ ${prefix}${max}`;
  }

  /** Removing a chip drops that one constraint and reloads immediately. */
  protected async removeChip(key: keyof ProductFilters): Promise<void> {
    const cleared = { ...this.appliedFilters };

    if (key === 'priceMin') {
      cleared.priceMin = null;
      cleared.priceMax = null;
    } else if (key === 'stockMin') {
      cleared.stockMin = null;
      cleared.stockMax = null;
    } else if (key === 'status') {
      cleared.status = 'all';
    } else if (key === 'lowStockOnly') {
      cleared.lowStockOnly = false;
    } else if (key === 'categoryId' || key === 'supplierId' || key === 'location') {
      cleared[key] = '';
    }

    this.appliedFilters = cleared;
    this.draft = { ...cleared, search: this.searchValue };
    this.pageIndex.set(0);
    await this.loadProducts(false);
    this.syncToolbarFilters();
  }

  protected async onPage(event: PageEvent): Promise<void> {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    await this.loadProducts(false);
  }

  protected isLowStock(product: Product): boolean {
    return product.stock_current <= product.stock_minimum;
  }

  /** "Mostrando 1–25 de 31 productos" — makes the page size obvious at a glance. */
  protected get resultSummary(): string {
    const total = this.totalCount();
    if (total === 0) return 'Sin productos';
    const from = this.pageIndex() * this.pageSize() + 1;
    const to = Math.min(from + this.dataSource.data.length - 1, total);
    const noun = total === 1 ? 'producto' : 'productos';
    const term = this.searchValue ? ` para “${this.searchValue}”` : '';
    const filtered = this.hasActiveFilters ? ' (filtrados)' : '';
    return `Mostrando ${from}–${to} de ${total} ${noun}${term}${filtered}`;
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

  protected openCustomFields(): void {
    const ref = this.dialog.open(CustomFieldsDialogComponent, {
      width: '620px',
      maxHeight: '85vh',
      data: {
        columns: this.columns.map(c => ({ ...c })),
        // Applied live so the table updates behind the dialog; nothing is left
        // pending, which is why closing can no longer save by surprise.
        onColumnsChange: (columns: ColumnConfig[]) => {
          this.columns = columns;
          void this.columnPrefsService.save(TABLE_NAME, columns);
        },
      },
    });
    ref.afterClosed().subscribe(async () => {
      // Reload to pick up added/removed custom fields and their table flags.
      await this.loadColumnPrefs();
    });
  }

  protected async exportCSV(): Promise<void> {
    try {
      const rows = await this.productsService.getAllFiltered(
        this.searchValue || undefined,
        { ...this.appliedFilters, search: this.searchValue },
      );
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

  /**
   * Detail and editing are the same surface now: fields turn into inputs on
   * click, so there is no separate edit screen to navigate to.
   */
  /**
   * A right-anchored cover sheet, not a floating modal: it spans the full height
   * and stops where the sidebar begins, which stays visible.
   */
  private coverSheetConfig() {
    return {
      width: `calc(100vw - ${SIDENAV_WIDTH}px)`,
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      position: { right: '0', top: '0' },
      panelClass: 'pd-panel',
      backdropClass: 'pd-backdrop',
      autoFocus: false,
    };
  }

  protected viewProduct(product: Product): void {
    const ref = this.dialog.open(ProductDetailDialogComponent, {
      ...this.coverSheetConfig(),
      data: { product, customFields: this.customFields },
    });
    ref.afterClosed().subscribe(async (changed: boolean) => {
      if (changed) await this.loadProducts(false);
    });
  }

  /** New products use the same cover sheet, so creating never leaves the list. */
  protected newProduct(): void {
    const ref = this.dialog.open(ProductFormComponent, {
      ...this.coverSheetConfig(),
      data: {},
    });
    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (!saved) return;
      this.snackBar.open('Producto creado', 'Cerrar', { duration: 3000 });
      this.pageIndex.set(0);
      await this.loadProducts(false);
    });
  }

  protected openMovementDialog(product: Product, defaultType?: MovementType): void {
    const ref = this.dialog.open(MovementDialogComponent, {
      data: { product, defaultType },
      width: '480px',
    });
    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (saved) {
        this.snackBar.open('Movimiento registrado correctamente', 'Cerrar', { duration: 3000 });
        await this.loadProducts();
      }
    });
  }

  /** "Editar" now opens the same inline-editing panel as clicking the row. */
  protected editProduct(product: Product): void {
    this.viewProduct(product);
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
