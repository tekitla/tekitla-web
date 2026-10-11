import { describe, expect, it } from 'vitest';

import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('toma la primera letra de las dos primeras palabras del nombre', () => {
    expect(initialsOf({ displayName: 'Victor Rojas Baez', email: null })).toBe('VR');
  });

  it('con una sola palabra usa sus dos primeras letras', () => {
    expect(initialsOf({ displayName: 'victor', email: null })).toBe('VI');
  });

  it('sin nombre (o sólo espacios) usa el inicio del correo', () => {
    expect(initialsOf({ displayName: '   ', email: 'ana.lopez@example.com' })).toBe('AL');
    expect(initialsOf({ displayName: null, email: 'x@example.com' })).toBe('X');
  });

  it('no parte caracteres fuera del plano básico', () => {
    expect(initialsOf({ displayName: '😀 Ana', email: null })).toBe('😀A');
    expect(initialsOf({ displayName: '😀', email: null })).toBe('😀');
  });

  it('sin usuario devuelve vacío', () => {
    expect(initialsOf(null)).toBe('');
  });
});
