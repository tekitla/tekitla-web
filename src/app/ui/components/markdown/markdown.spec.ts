import { SecurityContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';

import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renderiza Markdown (GFM)', () => {
    const html = renderMarkdown('# Título\n\n- uno\n- **dos**');
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<strong>dos</strong>');
  });

  it('el sanitizador de Angular (el de [innerHTML]) quita lo peligroso', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sanitizer = TestBed.inject(DomSanitizer);
    const html = renderMarkdown(
      'hola <script>alert(1)</script> <img src=x onerror="alert(2)"> [x](javascript:alert(3))',
    );

    const safe = sanitizer.sanitize(SecurityContext.HTML, html) ?? '';

    expect(safe).not.toContain('<script');
    expect(safe).not.toContain('onerror');
    // Angular neutraliza la URL anteponiendo `unsafe:`.
    expect(safe).not.toMatch(/href="javascript:/);
    expect(safe).toContain('hola');
  });
});
