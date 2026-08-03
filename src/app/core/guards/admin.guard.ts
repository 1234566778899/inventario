import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // toObservable() must run inside injection context — capture BEFORE any await.
  const profileLoaded$ = toObservable(auth.profileLoaded);

  const session = await auth.getSession();
  if (!session) return router.createUrlTree(['/login']);

  if (!auth.profileLoaded()) {
    await firstValueFrom(profileLoaded$.pipe(filter(loaded => loaded)));
  }

  if (!auth.isAdmin()) return router.createUrlTree(['/dashboard']);
  return true;
};
