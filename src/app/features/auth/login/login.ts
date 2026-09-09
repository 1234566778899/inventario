import { Component, inject, signal, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('emailInput') private readonly emailInput?: ElementRef<HTMLInputElement>;

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly hidePassword = signal(true);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngAfterViewInit(): void {
    setTimeout(() => this.emailInput?.nativeElement.focus(), 150);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const { email, password } = this.form.getRawValue();
    const { error } = await this.auth.login(email, password);

    if (error) {
      // A deactivated account fails here too; saying "wrong password" would send
      // the person off chasing a credential problem they cannot fix.
      this.errorMessage.set(
        error.code === 'user_banned'
          ? 'Tu cuenta está desactivada. Contacta al administrador.'
          : 'Correo o contraseña incorrectos. Por favor intente nuevamente.'
      );
      this.loading.set(false);
      return;
    }

    await this.router.navigate(['/dashboard']);
  }

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(v => !v);
  }
}
