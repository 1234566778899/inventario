import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ViewChild, AfterViewInit } from '@angular/core';
import { MovementsService } from '../../core/services/movements.service';
import { ProductsService } from '../../core/services/products.service';
import { AuthService } from '../../core/services/auth.service';
import { StockMovement, Product } from '../../core/models';
import { MovementDialogComponent } from '../../shared/movement-dialog/movement-dialog';
import { DatePipe } from '@angular/common';
import { MovementDeltaPipe, MovementDeltaClassPipe } from '../../shared/pipes/movement-delta.pipe';

@Component({
  selector: 'app-movements',
  standalone: true,
  imports: [
    FormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatPaginatorModule,
    MatSortModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatButtonToggleModule,
    MatMenuModule,
    MatTooltipModule,
    DatePipe,
    MovementDeltaPipe,
    MovementDeltaClassPipe,
  ],
  templateUrl: './movements.html',
  styleUrl: './movements.scss',
})
export class MovementsComponent implements OnInit, AfterViewInit {
  private readonly movementsService = inject(MovementsService);
  private readonly productsService = inject(ProductsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  protected readonly loading = signal(true);
  protected readonly dataSource = new MatTableDataSource<StockMovement>([]);
  protected readonly displayedColumns = [
    'created_at', 'product', 'type', 'quantity', 'previous_stock', 'new_stock', 'reason', 'user'
  ];
  protected products: Product[] = [];
  protected selectedProductId = '';
  protected selectedType = '';
  protected dateFrom: Date | null = null;
  protected dateTo: Date | null = null;
  // autocomplete state — holds a string while typing, a Product after selection
  protected productInput: Product | string | null = null;

  protected get filteredProducts(): Product[] {
    const q = typeof this.productInput === 'string' ? this.productInput.toLowerCase().trim() : '';
    if (!q) return this.products;
    return this.products.filter(p =>
      p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)
    );
  }

  protected readonly displayFn = (p: Product | string | null): string =>
    p && typeof p === 'object' ? p.name : '';

  async ngOnInit(): Promise<void> {
    this.products = await this.productsService.getAll();
    await this.load();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const productId = this.selectedProductId || undefined;
      let movements = await this.movementsService.getAll(productId);
      if (this.selectedType) {
        movements = movements.filter(m => m.type === this.selectedType);
      }
      movements = this.applyDateRange(movements);
      this.dataSource.data = movements;
    } finally {
      this.loading.set(false);
      // The table lives inside @else so MatSort/MatPaginator are recreated on every
      // load cycle. Reconnect after Angular has rendered the new view.
      setTimeout(() => {
        if (this.sort)      this.dataSource.sort = this.sort;
        if (this.paginator) this.dataSource.paginator = this.paginator;

        // Ensure date strings sort chronologically
        this.dataSource.sortingDataAccessor = (row, col) =>
          col === 'created_at' ? new Date(row.created_at).getTime() : (row as never)[col];
      });
    }
  }

  /** Filters on whole days: "from" starts at 00:00 and "to" includes all of that day. */
  private applyDateRange(movements: StockMovement[]): StockMovement[] {
    if (!this.dateFrom && !this.dateTo) return movements;

    const start = this.dateFrom ? new Date(this.dateFrom).setHours(0, 0, 0, 0) : -Infinity;
    const end = this.dateTo ? new Date(this.dateTo).setHours(23, 59, 59, 999) : Infinity;

    return movements.filter(m => {
      const t = new Date(m.created_at).getTime();
      return t >= start && t <= end;
    });
  }

  protected get hasActiveFilters(): boolean {
    return !!(this.productInput || this.selectedType || this.dateFrom || this.dateTo);
  }

  /** "Mostrando 42 movimientos" — the row count is what you check when squaring stock. */
  protected get resultSummary(): string {
    const total = this.dataSource.data.length;
    if (total === 0) return 'Sin movimientos';
    const noun = total === 1 ? 'movimiento' : 'movimientos';
    return `${total} ${noun}${this.hasActiveFilters ? ' (filtrados)' : ''}`;
  }

  protected async applyFilters(): Promise<void> {
    await this.load();
  }

  protected onProductSelected(product: Product): void {
    this.selectedProductId = product.id;
    this.load();
  }

  protected onProductInputChange(val: Product | string | null): void {
    if (!val) {
      this.selectedProductId = '';
      this.load();
    }
  }

  protected clearProductInput(): void {
    this.productInput = null;
    this.selectedProductId = '';
    this.load();
  }

  protected async clearFilters(): Promise<void> {
    this.productInput = null;
    this.selectedProductId = '';
    this.selectedType = '';
    this.dateFrom = null;
    this.dateTo = null;
    await this.load();
  }

  /** Exports exactly what the filters are showing — that is what the accountant asks for. */
  protected exportCSV(): void {
    const rows = this.dataSource.data;
    if (rows.length === 0) {
      this.snackBar.open('No hay movimientos para exportar', 'Cerrar', { duration: 3000 });
      return;
    }

    const headers = [
      'Fecha', 'SKU', 'Producto', 'Tipo', 'Cantidad',
      'Stock Anterior', 'Stock Nuevo', 'Motivo', 'Usuario',
    ];
    const escape = (v: string | number | null | undefined) =>
      typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : (v ?? '');

    const lines = [
      headers.join(','),
      ...rows.map(m => [
        escape(new Date(m.created_at).toLocaleString('es-PE')),
        escape(m.product?.sku),
        escape(m.product?.name),
        escape(this.typeLabel(m.type)),
        m.type === 'salida' ? -m.quantity : m.quantity,
        m.previous_stock,
        m.new_stock,
        escape(m.reason),
        escape(m.user?.full_name || m.user?.email),
      ].join(',')),
    ];

    // BOM keeps accents readable when the file is opened in Excel.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected openMovementDialog(): void {
    if (!this.products.length) return;
    // Use first product as default, dialog lets user pick
    const ref = this.dialog.open(MovementDialogComponent, {
      data: { product: this.products[0] },
      width: '480px',
    });

    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (saved) {
        this.snackBar.open('Movimiento registrado', 'Cerrar', { duration: 3000 });
        await this.load();
      }
    });
  }

  protected typeBadge(type: string): string {
    return { entrada: 'badge-success', salida: 'badge-danger', ajuste: 'badge-info' }[type] ?? 'badge-secondary';
  }

  protected typeLabel(type: string): string {
    return { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' }[type] ?? type;
  }
}
