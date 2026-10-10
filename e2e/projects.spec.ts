import { expect, test } from '@playwright/test';

import { fakeApi, signIn } from './support/fake-backend';

const SHOTS = process.env['SCREENSHOT_DIR'];

test('lista los proyectos y entra al tablero', async ({ page }) => {
  await signIn(page);
  await fakeApi(page);

  await page.goto('/');

  await expect(page).toHaveURL(/\/proyectos$/);
  await page.getByRole('link', { name: /TK\s+Tekitla/ }).click();
  await expect(page).toHaveURL(/\/proyectos\/p-tk$/);
});

test('valida la key y muestra el error de key repetida (409)', async ({ page }) => {
  await signIn(page);
  await fakeApi(page);
  await page.goto('/proyectos');

  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const key = page.getByLabel('Clave');
  await expect(key).toBeFocused();

  await key.fill('1ab');
  await key.blur();
  await expect(page.getByText('La clave tiene que empezar con una letra.')).toBeVisible();

  await key.fill('tk'); // se normaliza a mayúsculas
  await expect(key).toHaveValue('TK');
  await page.getByLabel('Nombre').fill('Otro Tekitla');
  await page.getByRole('button', { name: 'Crear proyecto' }).click();

  await expect(page.getByText('Ya tienes un proyecto con la clave TK. Elige otra.')).toBeVisible();
  await expect(key).toHaveAttribute('aria-invalid', 'true');
  await expect(key).toBeFocused();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/proyectos-409.png`, fullPage: true });

  await key.fill('WEB');
  await page.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page).toHaveURL(/\/proyectos\/p-2$/);
});

test('una cuenta fuera de la allowlist (403) ve «Tu cuenta no tiene acceso»', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, { forbidden: true });

  await page.goto('/proyectos');

  await expect(page).toHaveURL(/\/sin-acceso$/);
  await expect(page.getByRole('heading', { name: 'Tu cuenta no tiene acceso' })).toBeVisible();
  await expect(page.getByText('victor@example.com')).toBeVisible();
});

test('sin sesión redirige al login', async ({ page }) => {
  await page.goto('/proyectos/p-tk');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fproyectos%2Fp-tk/);
  await expect(page.getByRole('button', { name: 'Entrar con Google' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/login.png` });
});
