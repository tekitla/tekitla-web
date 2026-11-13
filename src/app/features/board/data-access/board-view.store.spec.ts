import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardViewStore } from './board-view.store';

describe('BoardViewStore', () => {
  let store: BoardViewStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [BoardViewStore] });
    store = TestBed.inject(BoardViewStore);
  });

  afterEach(() => vi.restoreAllMocks());

  it('compacta la primera vez; lo elegido se recuerda por proyecto', () => {
    store.use('TK');
    expect(store.density()).toBe('compacta');
    store.update({ density: 'comoda' });
    expect(store.density()).toBe('comoda');
    expect(JSON.parse(localStorage.getItem('tk.tablero.vista.TK')!)).toMatchObject({
      density: 'comoda',
    });

    // Otro proyecto arranca con lo suyo; volver trae lo recordado.
    store.use('RND');
    expect(store.density()).toBe('compacta');
    store.use('TK');
    expect(store.density()).toBe('comoda');
  });

  it('una instancia nueva (recargar) lee lo guardado', () => {
    localStorage.setItem('tk.tablero.vista.TK', '{"density":"comoda"}');
    store.use('TK');
    expect(store.density()).toBe('comoda');
  });

  it('sin localStorage sigue andando, sin recordar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    store.use('TK');
    expect(store.density()).toBe('compacta');
    store.update({ density: 'comoda' });
    expect(store.density()).toBe('comoda');
  });

  it('sin clave de proyecto no guarda nada', () => {
    store.update({ density: 'comoda' });
    expect(localStorage.length).toBe(0);
  });
});
