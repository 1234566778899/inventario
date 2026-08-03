import { Component, inject, signal, OnInit } from '@angular/core';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models';
import { MovementDialogComponent } from '../../shared/movement-dialog/movement-dialog';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './alerts.html',
  styleUrl: './alerts.scss',
})
export class AlertsComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = signal(true);
  protected readonly dataSource = new MatTableDataSource<Product>([]);
  protected readonly displayedColumns = [
    'sku', 'name', 'category', 'stock_current', 'stock_minimum', 'deficit', 'location', 'actions'
  ];

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const all = await this.productsService.getAll();
      this.dataSource.data = all
        .filter(p => p.is_active && p.stock_current <= p.stock_minimum)
        .sort((a, b) => (a.stock_current - a.stock_minimum) - (b.stock_current - b.stock_minimum));
    } finally {
      this.loading.set(false);
    }
  }

  protected deficit(product: Product): number {
    return Math.max(0, product.stock_minimum - product.stock_current);
  }

  protected openMovement(product: Product): void {
    const ref = this.dialog.open(MovementDialogComponent, {
      data: { product },
      width: '480px',
    });

    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (saved) {
        this.snackBar.open('Movimiento registrado', 'Cerrar', { duration: 3000 });
        await this.load();
      }
    });
  }
}
