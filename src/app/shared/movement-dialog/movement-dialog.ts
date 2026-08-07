import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MovementsService } from '../../core/services/movements.service';
import { Product, MovementType } from '../../core/models';

export interface MovementDialogData {
  product: Product;
  /** Preselects the movement type so the dialog opens on the intended action. */
  defaultType?: MovementType;
}

@Component({
  selector: 'app-movement-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './movement-dialog.html',
  styleUrl: './movement-dialog.scss',
})
export class MovementDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly movementsService = inject(MovementsService);
  protected readonly data: MovementDialogData = inject(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<MovementDialogComponent>);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly movementTypes: { value: MovementType; label: string; icon: string }[] = [
    { value: 'entrada',  label: 'Entrada (agregar stock)',          icon: 'add_circle' },
    { value: 'salida',   label: 'Salida (reducir stock)',            icon: 'remove_circle' },
    { value: 'ajuste',   label: 'Ajuste (establecer stock exacto)', icon: 'tune' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    type: [this.data.defaultType ?? ('entrada' as MovementType), Validators.required],
    quantity: [1, [Validators.required, Validators.min(0)]],
    reason: [''],
    notes: [''],
  });

  protected get dialogTitle(): string {
    const type = this.form.get('type')?.value as MovementType;
    return {
      entrada: 'Registrar Entrada de Stock',
      salida: 'Registrar Salida de Stock',
      ajuste: 'Ajustar Stock',
    }[type] ?? 'Registrar Movimiento de Stock';
  }

  protected get quantityLabel(): string {
    const type = this.form.get('type')?.value as MovementType;
    return type === 'ajuste' ? 'Nuevo stock total' : 'Cantidad';
  }

  protected get quantityHint(): string {
    const type = this.form.get('type')?.value as MovementType;
    const current = this.data.product.stock_current;
    if (type === 'ajuste') return `Stock actual: ${current}`;
    if (type === 'entrada') return `Stock resultante: ${current + (this.form.get('quantity')?.value ?? 0)}`;
    if (type === 'salida') return `Stock resultante: ${current - (this.form.get('quantity')?.value ?? 0)}`;
    return '';
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.loading.set(true);
    this.errorMessage.set('');

    const { type, quantity, reason, notes } = this.form.getRawValue();

    try {
      await this.movementsService.create(
        this.data.product.id,
        type,
        quantity,
        reason || null,
        notes || null
      );
      this.dialogRef.close(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar movimiento';
      this.errorMessage.set(msg);
    } finally {
      this.loading.set(false);
    }
  }
}
