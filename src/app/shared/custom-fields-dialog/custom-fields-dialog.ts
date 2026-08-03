import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { CustomFieldsService } from '../../core/services/custom-fields.service';
import { CustomField, CustomFieldType, ColumnConfig } from '../../core/models';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

export interface CustomFieldsDialogData {
  columns?: ColumnConfig[];
}

export interface CustomFieldsDialogResult {
  columns?: ColumnConfig[];
}

@Component({
  selector: 'app-custom-fields-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  templateUrl: './custom-fields-dialog.html',
  styleUrl: './custom-fields-dialog.scss',
})
export class CustomFieldsDialogComponent implements OnInit {
  private readonly service = inject(CustomFieldsService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<CustomFieldsDialogComponent, CustomFieldsDialogResult>);
  private readonly data = inject<CustomFieldsDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly showForm = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly fields = signal<CustomField[]>([]);
  protected columns: ColumnConfig[] = (this.data.columns ?? []).map(c => ({ ...c }));
  private columnsChanged = false;

  protected readonly fieldTypes: { value: CustomFieldType; label: string }[] = [
    { value: 'text',    label: 'Texto' },
    { value: 'number',  label: 'Número' },
    { value: 'boolean', label: 'Sí/No' },
    { value: 'date',    label: 'Fecha' },
    { value: 'select',  label: 'Lista de opciones' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name:          ['', [Validators.required, Validators.pattern(/^[a-z_][a-z0-9_]*$/)]],
    label:         ['', Validators.required],
    field_type:    ['text' as CustomFieldType, Validators.required],
    is_required:   [false],
    is_visible:    [true],
    display_order: [0],
    options_text:  [''],
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
      this.fields.set(await this.service.getAll());
    } finally {
      this.loading.set(false);
    }
  }

  protected startAdd(): void {
    this.editingId.set(null);
    this.form.reset({
      name: '', label: '', field_type: 'text',
      is_required: false, is_visible: true,
      display_order: this.fields().length, options_text: '',
    });
    this.showForm.set(true);
  }

  protected startEdit(field: CustomField): void {
    this.editingId.set(field.id);
    this.form.patchValue({
      name: field.name, label: field.label, field_type: field.field_type,
      is_required: field.is_required, is_visible: field.is_visible,
      display_order: field.display_order, options_text: field.options?.join(', ') ?? '',
    });
    this.showForm.set(true);
  }

  protected cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const options = raw.field_type === 'select' && raw.options_text
      ? raw.options_text.split(',').map((s: string) => s.trim()).filter(Boolean)
      : null;
    const payload = {
      name: raw.name, label: raw.label, field_type: raw.field_type,
      is_required: raw.is_required, is_visible: raw.is_visible,
      display_order: raw.display_order, options,
    };
    try {
      if (this.editingId()) {
        await this.service.update(this.editingId()!, payload);
      } else {
        await this.service.create(payload);
      }
      this.cancelForm();
      await this.load();
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggleVisible(field: CustomField): Promise<void> {
    const nowVisible = !field.is_visible;
    this.fields.update(fs => fs.map(f => f.id === field.id ? { ...f, is_visible: nowVisible } : f));
    try {
      await this.service.update(field.id, { is_visible: nowVisible });
    } catch {
      await this.load();
    }
  }

  protected delete(field: CustomField): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar campo',
        message: `¿Eliminar "${field.label}"? Se perderán todos los valores guardados.`,
        confirmLabel: 'Eliminar',
      },
    });
    ref.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        await this.service.delete(field.id);
        await this.load();
      }
    });
  }

  protected fieldTypeLabel(type: string): string {
    return this.fieldTypes.find(f => f.value === type)?.label ?? type;
  }

  protected close(): void {
    this.dialogRef.close(this.columnsChanged ? { columns: this.columns } : undefined);
  }

  protected toggleColumnVisibility(col: ColumnConfig): void {
    this.columns = this.columns.map(c =>
      c.id === col.id ? { ...c, visible: !c.visible } : c
    );
    this.columnsChanged = true;
  }
}
