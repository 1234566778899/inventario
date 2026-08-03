import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomFieldsService } from '../../../core/services/custom-fields.service';
import { CustomField, CustomFieldType } from '../../../core/models';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-custom-fields',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './custom-fields.html',
  styleUrl: './custom-fields.scss',
})
export class CustomFieldsComponent implements OnInit {
  private readonly service = inject(CustomFieldsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly dataSource = new MatTableDataSource<CustomField>([]);
  protected readonly displayedColumns = ['label', 'name', 'field_type', 'is_required', 'display_order', 'actions'];

  protected readonly fieldTypes: { value: CustomFieldType; label: string }[] = [
    { value: 'text',    label: 'Texto' },
    { value: 'number',  label: 'Número' },
    { value: 'boolean', label: 'Sí/No (Booleano)' },
    { value: 'date',    label: 'Fecha' },
    { value: 'select',  label: 'Lista de opciones' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name:          ['', [Validators.required, Validators.pattern(/^[a-z_][a-z0-9_]*$/)]],
    label:         ['', Validators.required],
    field_type:    ['text' as CustomFieldType, Validators.required],
    is_required:   [false],
    display_order: [0],
    options_text:  [''], // comma-separated for select type
  });

  protected get showOptions(): boolean {
    return this.form.get('field_type')?.value === 'select';
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.dataSource.data = await this.service.getAll();
    } finally {
      this.loading.set(false);
    }
  }

  protected startEdit(field: CustomField): void {
    this.editingId.set(field.id);
    this.form.patchValue({
      name:          field.name,
      label:         field.label,
      field_type:    field.field_type,
      is_required:   field.is_required,
      display_order: field.display_order,
      options_text:  field.options?.join(', ') ?? '',
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', label: '', field_type: 'text', is_required: false, display_order: 0, options_text: '' });
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.saving.set(true);
    const raw = this.form.getRawValue();

    const options = raw.field_type === 'select' && raw.options_text
      ? raw.options_text.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    const payload = {
      name:          raw.name,
      label:         raw.label,
      field_type:    raw.field_type,
      is_required:   raw.is_required,
      is_visible:    true,
      display_order: raw.display_order,
      options,
    };

    try {
      const editId = this.editingId();
      if (editId) {
        await this.service.update(editId, payload);
        this.snackBar.open('Campo actualizado', 'Cerrar', { duration: 3000 });
      } else {
        await this.service.create(payload);
        this.snackBar.open('Campo creado', 'Cerrar', { duration: 3000 });
      }
      this.cancelEdit();
      await this.load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar';
      this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async delete(field: CustomField): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar Campo',
        message: `¿Eliminar el campo "${field.label}"? Se eliminarán también todos los valores guardados para este campo.`,
        confirmLabel: 'Eliminar',
      },
    });

    ref.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        try {
          await this.service.delete(field.id);
          this.snackBar.open('Campo eliminado', 'Cerrar', { duration: 3000 });
          await this.load();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error al eliminar';
          this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
        }
      }
    });
  }

  protected fieldTypeLabel(type: string): string {
    return this.fieldTypes.find(f => f.value === type)?.label ?? type;
  }
}
