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
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { CustomFieldsService } from '../../core/services/custom-fields.service';
import { CustomField, CustomFieldType, ColumnConfig } from '../../core/models';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

export interface CustomFieldsDialogData {
  columns?: ColumnConfig[];
  /**
   * Called on every column change so the table updates live. Everything in this
   * dialog now saves immediately — there is no pending state to confirm, which
   * is what made closing with the ✕ silently persist edits before.
   */
  onColumnsChange?: (columns: ColumnConfig[]) => void;
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
    DragDropModule,
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
  protected columns: ColumnConfig[] = (this.data.columns ?? [])
    .filter(c => c.id !== 'actions')
    .map(c => ({ ...c }))
    .sort((a, b) => a.order - b.order);
  /** The actions column is never user-configurable, but must survive round-trips. */
  private readonly actionsColumn = (this.data.columns ?? []).find(c => c.id === 'actions');

  protected get visibleColumnCount(): number {
    return this.columns.filter(c => c.visible).length;
  }

  protected get allColumnsVisible(): boolean {
    return this.columns.length > 0 && this.columns.every(c => c.visible);
  }

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
    show_in_table: [true],
    display_order: [0],
    options_text:  [''],
  });

  /** The identifier is derived from the label until the user edits it by hand. */
  protected readonly showIdentifier = signal(false);
  private identifierTouched = false;

  protected get showOptions(): boolean {
    return this.form.get('field_type')?.value === 'select';
  }

  protected onLabelInput(): void {
    if (this.identifierTouched || this.editingId()) return;
    this.form.patchValue({ name: this.slugify(this.form.getRawValue().label) }, { emitEvent: false });
  }

  protected onIdentifierInput(): void {
    this.identifierTouched = true;
  }

  /** "Marca del Producto" → "marca_del_producto" */
  private slugify(label: string): string {
    return label
      .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, '_$1')                            // must not start with a digit
      .slice(0, 40);
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

  protected toggleIdentifier(): void {
    this.showIdentifier.update(v => !v);
  }

  /**
   * Reactive forms ignore a template [disabled] binding, so the control is
   * toggled here instead — it stays off until the migration lands.
   */
  private syncShowInTableEnabled(): void {
    const control = this.form.get('show_in_table');
    if (this.canSplitTableFlag) control?.enable({ emitEvent: false });
    else control?.disable({ emitEvent: false });
  }

  protected startAdd(): void {
    this.editingId.set(null);
    this.identifierTouched = false;
    this.showIdentifier.set(false);
    this.form.reset({
      name: '', label: '', field_type: 'text',
      is_required: false, is_visible: true, show_in_table: true,
      display_order: this.fields().length, options_text: '',
    });
    this.syncShowInTableEnabled();
    this.showForm.set(true);
  }

  protected startEdit(field: CustomField): void {
    this.editingId.set(field.id);
    // Renaming the identifier would orphan stored values, so it stays as-is.
    this.identifierTouched = true;
    this.showIdentifier.set(false);
    this.form.patchValue({
      name: field.name, label: field.label, field_type: field.field_type,
      is_required: field.is_required, is_visible: field.is_visible,
      show_in_table: field.show_in_table ?? field.is_visible,
      display_order: field.display_order, options_text: field.options?.join(', ') ?? '',
    });
    this.syncShowInTableEnabled();
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
      show_in_table: raw.show_in_table,
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
    // Column changes were already pushed live; nothing is pending on close.
    this.dialogRef.close(undefined);
  }

  /** Pushes the current column set to the host so the table reflects it at once. */
  private emitColumns(): void {
    this.columns.forEach((c, i) => (c.order = i));
    const payload = this.actionsColumn
      ? [...this.columns, { ...this.actionsColumn, order: this.columns.length }]
      : [...this.columns];
    this.data.onColumnsChange?.(payload);
  }

  protected toggleColumnVisibility(col: ColumnConfig): void {
    const target = this.columns.find(c => c.id === col.id);
    if (!target) return;
    target.visible = !target.visible;
    this.emitColumns();
  }

  protected setAllColumns(visible: boolean): void {
    this.columns.forEach(c => (c.visible = visible));
    this.emitColumns();
  }

  protected dropColumn(event: CdkDragDrop<ColumnConfig[]>): void {
    moveItemInArray(this.columns, event.previousIndex, event.currentIndex);
    this.emitColumns();
  }

  /** Field order is drag-driven now, so display_order is written back silently. */
  protected async dropField(event: CdkDragDrop<CustomField[]>): Promise<void> {
    const list = [...this.fields()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.fields.set(list);
    await Promise.all(
      list.map((f, i) =>
        f.display_order === i ? Promise.resolve() : this.service.update(f.id, { display_order: i })
      )
    );
  }

  protected async toggleShowInTable(field: CustomField): Promise<void> {
    const next = !(field.show_in_table ?? field.is_visible);
    this.fields.update(fs => fs.map(f => f.id === field.id ? { ...f, show_in_table: next } : f));
    try {
      await this.service.update(field.id, { show_in_table: next });
    } catch {
      await this.load();
    }
  }

  protected showsInTable(field: CustomField): boolean {
    return field.show_in_table ?? field.is_visible;
  }

  /** The table-column toggle needs the migrated column to persist anything. */
  protected get canSplitTableFlag(): boolean {
    return this.service.hasShowInTable;
  }
}
