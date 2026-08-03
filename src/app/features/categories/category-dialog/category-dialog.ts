import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CategoriesService } from '../../../core/services/categories.service';
import { Category } from '../../../core/models';

export interface CategoryDialogData {
  category?: Category;
}

@Component({
  selector: 'app-category-dialog',
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
  templateUrl: './category-dialog.html',
})
export class CategoryDialogComponent {
  private readonly service = inject(CategoriesService);
  private readonly dialogRef = inject(MatDialogRef<CategoryDialogComponent, Category | false>);
  protected readonly data = inject<CategoryDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly isEdit = !!this.data.category;

  protected readonly form = this.fb.nonNullable.group({
    name:        [this.data.category?.name ?? '', Validators.required],
    description: [this.data.category?.description ?? ''],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.saving.set(true);
    this.error.set('');
    const raw = this.form.getRawValue();
    const payload = {
      name:        raw.name,
      description: raw.description || null,
      parent_id:   null,
    };

    try {
      let saved: Category;
      if (this.isEdit) {
        saved = await this.service.update(this.data.category!.id, payload);
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
