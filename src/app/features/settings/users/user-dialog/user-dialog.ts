import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UsersService } from '../../../../core/services/users.service';
import { User } from '../../../../core/models';

export interface UserDialogData {
  /** Present → edit mode. Absent → create mode. */
  user?: User;
}

/**
 * Right-anchored cover sheet for creating and editing users — same pattern as
 * the product form (close ear on the left edge, header pinned, fields scroll).
 */
@Component({
  selector: 'app-user-dialog',
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
    MatTooltipModule,
  ],
  templateUrl: './user-dialog.html',
  styleUrl: './user-dialog.scss',
})
export class UserDialogComponent {
  private readonly usersService = inject(UsersService);
  private readonly dialogRef = inject(MatDialogRef<UserDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  protected readonly data = inject<UserDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  protected readonly isEdit = !!this.data.user;
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    full_name: [this.data.user?.full_name ?? '', Validators.required],
    email: [this.data.user?.email ?? '', [Validators.required, Validators.email]],
    // Required only when creating; on edit it means "set a new password".
    password: ['', this.data.user ? [Validators.minLength(8)] : [Validators.required, Validators.minLength(8)]],
    role: [(this.data.user?.role ?? 'user') as 'admin' | 'user', Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.saving.set(true);
    this.error.set('');
    const { full_name, email, password, role } = this.form.getRawValue();

    let error: Error | null;

    if (this.data.user) {
      const changes: { fullName: string; role: 'admin' | 'user'; email?: string; password?: string } = {
        fullName: full_name,
        role,
      };
      if (email !== this.data.user.email) changes.email = email;
      if (password) changes.password = password;
      ({ error } = await this.usersService.updateUser(this.data.user.id, changes));
    } else {
      ({ error } = await this.usersService.createUser(email, password, full_name, role));
    }

    if (error) {
      this.error.set(error.message);
      this.saving.set(false);
    } else {
      this.dialogRef.close(true);
    }
  }

  protected cancel(): void { this.dialogRef.close(false); }
}
