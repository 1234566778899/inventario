import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SuppliersService } from '../../../core/services/suppliers.service';
import { Supplier } from '../../../core/models';

export interface SupplierDialogData {
  supplier?: Supplier;
}

@Component({
  selector: 'app-supplier-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './supplier-dialog.html',
})
export class SupplierDialogComponent {
  private readonly service = inject(SuppliersService);
  private readonly dialogRef = inject(MatDialogRef<SupplierDialogComponent, Supplier | false>);
  protected readonly data = inject<SupplierDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected readonly isEdit = !!this.data.supplier;

  protected readonly form = this.fb.nonNullable.group({
    name:         [this.data.supplier?.name ?? '', Validators.required],
    contact_name: [this.data.supplier?.contact_name ?? ''],
    email:        [this.data.supplier?.email ?? '', Validators.email],
    phone:        [this.data.supplier?.phone ?? ''],
    address:      [this.data.supplier?.address ?? ''],
    notes:        [this.data.supplier?.notes ?? ''],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.saving.set(true);
    this.error.set('');
    const raw = this.form.getRawValue();
    const payload = {
      name:         raw.name,
      contact_name: raw.contact_name || null,
      email:        raw.email || null,
      phone:        raw.phone || null,
      address:      raw.address || null,
      notes:        raw.notes || null,
    };

    try {
      let saved: Supplier;
      if (this.isEdit) {
        saved = await this.service.update(this.data.supplier!.id, payload);
      } else {
        saved = await this.service.create(payload);
      }
      this.dialogRef.close(saved);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
