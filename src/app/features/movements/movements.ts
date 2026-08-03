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
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ViewChild, AfterViewInit } from '@angular/core';
import { MovementsService } from '../../core/services/movements.service';
import { ProductsService } from '../../core/services/products.service';
import { AuthService } from '../../core/services/auth.service';
import { StockMovement, Product } from '../../core/models';
import { MovementDialogComponent } from '../../shared/movement-dialog/movement-dialog';
import { DatePipe } from '@angular/common';

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
    DatePipe,
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
    await this.load();
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
