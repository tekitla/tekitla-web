import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW, parseStoredView, serializeStoredView, viewStorageKey } from './board-view';

describe('board-view', () => {
  it('la clave es por proyecto', () => {
    expect(viewStorageKey('RND')).toBe('tk.tablero.vista.RND');
  });

  it('sin nada guardado devuelve los defaults', () => {
    expect(parseStoredView(null)).toEqual(DEFAULT_VIEW);
  });

  it('ida y vuelta conserva panel, agrupar y densidad, y no guarda filtros', () => {
    const view = {
      panel: 'dividido',
      groupBy: 'asignado',
      density: 'compacta',
      filters: { assigneeIds: ['ana'] },
    } as const;
    const raw = serializeStoredView(view);
    expect(JSON.parse(raw)).toEqual({
      panel: 'dividido',
      groupBy: 'asignado',
      density: 'compacta',
    });
    expect(parseStoredView(raw)).toEqual({ ...view, filters: { assigneeIds: [] } });
  });

  it('un campo inválido vuelve a su default sin perder los demás', () => {
    const raw = JSON.stringify({ panel: 'flotante', groupBy: 'asignado', density: 3 });
    expect(parseStoredView(raw)).toEqual({ ...DEFAULT_VIEW, groupBy: 'asignado' });
  });

  it('JSON roto o que no es objeto devuelve los defaults', () => {
    expect(parseStoredView('{no')).toEqual(DEFAULT_VIEW);
    expect(parseStoredView('"hola"')).toEqual(DEFAULT_VIEW);
    expect(parseStoredView('null')).toEqual(DEFAULT_VIEW);
  });
});
