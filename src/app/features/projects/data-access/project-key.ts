import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Regla del proto: 2 a 10 mayúsculas o dígitos, empieza con letra (p. ej. `TK`, `WEB2`). */
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

/** Lo que el usuario tipea → candidato a key: mayúsculas y sin espacios. */
export function normalizeProjectKey(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

export function isValidProjectKey(value: string): boolean {
  return PROJECT_KEY_PATTERN.test(value);
}

/**
 * Validador de formulario para la key. Distingue el motivo para dar un mensaje
 * útil: `projectKeyStart` (no empieza con letra), `projectKeyChars` (caracteres
 * fuera de A–Z/0–9) o `projectKeyLength` (fuera de 2–10). Vacío lo maneja `required`.
 */
export const projectKeyValidator: ValidatorFn = (
  control: AbstractControl<string>,
): ValidationErrors | null => {
  const value = control.value ?? '';
  if (value === '' || isValidProjectKey(value)) return null;
  if (!/^[A-Z]/.test(value)) return { projectKeyStart: true };
  if (!/^[A-Z0-9]+$/.test(value)) return { projectKeyChars: true };
  return { projectKeyLength: { min: 2, max: 10, actual: value.length } };
};
