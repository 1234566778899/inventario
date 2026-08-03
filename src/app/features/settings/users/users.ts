import { Component, inject, signal, OnInit, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DatePipe } from '@angular/common';
import { UsersService } from '../../../core/services/users.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models';
import { UserDialogComponent } from './user-dialog/user-dialog';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    DatePipe,
  ],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class UsersComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);

  @ViewChild(MatSort) set matSort(sort: MatSort | undefined) {
    if (sort) this.dataSource.sort = sort;
  }

  protected readonly loading = signal(true);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly dataSource = new MatTableDataSource<User>([]);
  protected readonly displayedColumns = ['avatar', 'name', 'email', 'role', 'created_at', 'actions'];

  async ngOnInit(): Promise<void> {
    this.dataSource.filterPredicate = (user, filter) => {
      const term = filter.trim().toLowerCase();
      return (user.full_name ?? '').toLowerCase().includes(term)
        || user.email.toLowerCase().includes(term);
    };
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.dataSource.data = await this.usersService.getAll();
    } finally {
      this.loading.set(false);
    }
  }

  protected applyFilter(event: Event): void {
    this.dataSource.filter = (event.target as HTMLInputElement).value;
  }

  protected initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  protected isCurrentUser(user: User): boolean {
    return user.id === this.auth.currentUser()?.id;
  }

  protected openRegisterDialog(): void {
    const ref = this.dialog.open(UserDialogComponent, { width: '460px' });
    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (saved) {
        this.snackBar.open('Usuario registrado', 'Cerrar', { duration: 3000 });
        await this.load();
      }
    });
  }

  protected async changeRole(user: User, role: 'admin' | 'user'): Promise<void> {
    try {
      await this.usersService.updateRole(user.id, role);
      user.role = role;
      this.dataSource.data = [...this.dataSource.data];
      this.snackBar.open('Rol actualizado', 'Cerrar', { duration: 3000 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar rol';
      this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
    }
  }

  protected deleteUser(user: User): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar usuario',
        message: `¿Eliminar a <strong>${user.full_name || user.email}</strong>? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        color: 'warn',
      },
      width: '400px',
    });

    ref.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) return;
      this.deletingId.set(user.id);
      const { error } = await this.usersService.deleteUser(user.id);
      this.deletingId.set(null);
      if (error) {
        this.snackBar.open(error.message, 'Cerrar', { duration: 5000 });
      } else {
        this.dataSource.data = this.dataSource.data.filter(u => u.id !== user.id);
        this.snackBar.open('Usuario eliminado', 'Cerrar', { duration: 3000 });
      }
    });
  }
}
