import { Component, inject, signal, OnInit } from '@angular/core';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SuppliersService } from '../../core/services/suppliers.service';
import { AuthService } from '../../core/services/auth.service';
import { Supplier } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { SupplierDialogComponent } from './supplier-dialog/supplier-dialog';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './suppliers.html',
  styleUrl: './suppliers.scss',
})
export class SuppliersComponent implements OnInit {
  private readonly suppliersService = inject(SuppliersService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly dataSource = new MatTableDataSource<Supplier>([]);
  protected readonly displayedColumns = ['name', 'contact_name', 'email', 'phone', 'actions'];

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.dataSource.data = await this.suppliersService.getAll();
    } finally {
      this.loading.set(false);
    }
  }

  protected openDialog(supplier?: Supplier): void {
    const ref = this.dialog.open(SupplierDialogComponent, {
      width: '520px',
      data: { supplier },
    });
    ref.afterClosed().subscribe(async (saved: Supplier | false) => {
      if (saved) {
        const msg = supplier ? 'Proveedor actualizado' : 'Proveedor creado';
        this.snackBar.open(msg, 'Cerrar', { duration: 3000, panelClass: 'snack-success' });
        await this.load();
      }
    });
  }

  protected delete(supplier: Supplier): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar proveedor',
        message: `¿Eliminar el proveedor "${supplier.name}"?`,
        confirmLabel: 'Eliminar',
      },
    });
    ref.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        try {
          await this.suppliersService.delete(supplier.id);
          this.snackBar.open('Proveedor eliminado', 'Cerrar', { duration: 3000, panelClass: 'snack-success' });
          await this.load();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error al eliminar';
          this.snackBar.open(msg, 'Cerrar', { duration: 5000, panelClass: 'snack-error' });
        }
      }
    });
  }
}
