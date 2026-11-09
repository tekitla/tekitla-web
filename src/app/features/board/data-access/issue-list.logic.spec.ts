import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FILTERS,
  filtersFromParams,
  filtersToParams,
  hasFilters,
  matchesFilters,
  sameFilters,
  toListRequest,
} from './issue-list.logic';

describe('issue-list.logic', () => {
  it('sin parámetros: Activos, sin filtros, orden del tablero', () => {
    expect(filtersFromParams({})).toEqual(DEFAULT_FILTERS);
  });

  it('lee la URL y descarta lo que no reconoce', () => {
    expect(
      filtersFromParams({
        q: 'login',
        ver: 'hechos',
        prioridad: 'alta',
        etiqueta: 'l1',
        estado: 's1',
        orden: 'cambio',
      }),
    ).toEqual({
      scope: 'hechos',
      query: 'login',
      priority: 'PRIORITY_HIGH',
      labelId: 'l1',
      statusId: 's1',
      sort: 'cambio',
    });
    expect(filtersFromParams({ ver: 'otra', prioridad: 'x', orden: 'y' })).toEqual(DEFAULT_FILTERS);
    expect(filtersFromParams({ q: 'x'.repeat(300) }).query).toHaveLength(200);
  });

  it('ida y vuelta por la URL; lo que es por defecto no va', () => {
    const filters = filtersFromParams({ q: ' TK-3 ', ver: 'descartados', prioridad: 'urgente' });
    const params = filtersToParams(filters);
    expect(params).toEqual({
      q: 'TK-3',
      ver: 'descartados',
      prioridad: 'urgente',
      etiqueta: null,
      estado: null,
      orden: null,
    });
    expect(
      filtersFromParams({
        q: params.q ?? undefined,
        ver: params.ver ?? undefined,
        prioridad: params.prioridad ?? undefined,
      }),
    ).toEqual({ ...filters, query: 'TK-3' });
    expect(Object.values(filtersToParams(DEFAULT_FILTERS)).every((v) => v === null)).toBe(true);
  });

  it('toListRequest: pestaña → states (nunca state), filtros como listas y orden', () => {
    expect(toListRequest(DEFAULT_FILTERS)).toEqual({
      query: undefined,
      states: ['ISSUE_STATE_TODO', 'ISSUE_STATE_IN_PROGRESS'],
      statusIds: [],
      priorities: [],
      labelIds: [],
      orderBy: 'ISSUE_ORDER_RANK',
    });
    const req = toListRequest({
      scope: 'todos',
      query: '  login ',
      priority: 'PRIORITY_LOW',
      labelId: 'l1',
      statusId: 's2',
      sort: 'prioridad',
    });
    expect(req).toEqual({
      query: 'login',
      states: [],
      statusIds: ['s2'],
      priorities: ['PRIORITY_LOW'],
      labelIds: ['l1'],
      orderBy: 'ISSUE_ORDER_PRIORITY_DESC',
    });
    expect(req).not.toHaveProperty('state');
    expect(toListRequest({ ...DEFAULT_FILTERS, scope: 'descartados' }).states).toEqual([
      'ISSUE_STATE_CANCELED',
    ]);
  });

  it('matchesFilters: pestaña, estado, prioridad y etiqueta', () => {
    const issue = {
      state: 'ISSUE_STATE_CANCELED',
      statusId: 's9',
      priority: 'PRIORITY_HIGH',
      labelIds: ['l1'],
    } as Parameters<typeof matchesFilters>[0];
    expect(matchesFilters(issue, DEFAULT_FILTERS)).toBe(false);
    expect(matchesFilters(issue, { ...DEFAULT_FILTERS, scope: 'descartados' })).toBe(true);
    expect(matchesFilters(issue, { ...DEFAULT_FILTERS, scope: 'todos', statusId: 's1' })).toBe(
      false,
    );
    expect(
      matchesFilters(issue, {
        ...DEFAULT_FILTERS,
        scope: 'todos',
        priority: 'PRIORITY_HIGH',
        labelId: 'l1',
      }),
    ).toBe(true);
  });

  it('hasFilters y sameFilters', () => {
    expect(hasFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasFilters({ ...DEFAULT_FILTERS, scope: 'todos', sort: 'cambio' })).toBe(false);
    expect(hasFilters({ ...DEFAULT_FILTERS, query: 'x' })).toBe(true);
    expect(sameFilters(DEFAULT_FILTERS, { ...DEFAULT_FILTERS, query: '  ' })).toBe(true);
    expect(sameFilters(DEFAULT_FILTERS, { ...DEFAULT_FILTERS, sort: 'cambio' })).toBe(false);
  });
});
