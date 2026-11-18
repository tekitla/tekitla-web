import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanPrefixStore } from './plan-prefix.store';

describe('PlanPrefixStore', () => {
  let store: PlanPrefixStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [PlanPrefixStore] });
    store = TestBed.inject(PlanPrefixStore);
  });

  afterEach(() => vi.restoreAllMocks());

  it('CU-039-7: perfil/ la primera vez; el elegido se recuerda por proyecto', () => {
    store.use('p-tk');
    expect(store.prefix()).toBe('perfil/');
    store.set('Area');
    expect(store.prefix()).toBe('area/');
    expect(localStorage.getItem('tekitla-web.plan.prefijo.p-tk')).toBe('area/');

    store.use('p-rnd');
    expect(store.prefix()).toBe('perfil/');
    store.use('p-tk');
    expect(store.prefix()).toBe('area/');
  });

  it('una instancia nueva (recargar) lee lo guardado', () => {
    localStorage.setItem('tekitla-web.plan.prefijo.p-tk', 'area/');
    store.use('p-tk');
    expect(store.prefix()).toBe('area/');
  });

  it('sin localStorage sigue andando, sin recordar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    store.use('p-tk');
    expect(store.prefix()).toBe('perfil/');
    store.set('area/');
    expect(store.prefix()).toBe('area/');
  });
});
