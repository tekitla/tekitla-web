import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW, parseStoredView, serializeStoredView, viewStorageKey } from './board-view';

describe('board-view', () => {
  it('la primera vez: compacta, acoplado y sin agrupar', () => {
    expect(parseStoredView(null)).toEqual({
      panel: 'acoplado',
      groupBy: 'ninguno',
      density: 'compacta',
      filters: { assigneeIds: [] },
    });
  });

  it('ida y vuelta: solo «cómo se ve», sin los filtros', () => {
    const view = {
      panel: 'dividido',
      groupBy: 'etiqueta',
      density: 'comoda',
      filters: { assigneeIds: ['a1'] },
    } as const;
    const raw = serializeStoredView(view);
    expect(JSON.parse(raw)).toEqual({ panel: 'dividido', groupBy: 'etiqueta', density: 'comoda' });
    expect(parseStoredView(raw)).toEqual({ ...view, filters: { assigneeIds: [] } });
  });

  it('basura o valores viejos vuelven campo por campo al default', () => {
    expect(parseStoredView('{no es json')).toBe(DEFAULT_VIEW);
    expect(parseStoredView('"comoda"')).toBe(DEFAULT_VIEW);
    expect(parseStoredView('null')).toBe(DEFAULT_VIEW);
    expect(parseStoredView('{"density":"comoda","panel":"flotante","groupBy":7}')).toEqual({
      ...DEFAULT_VIEW,
      density: 'comoda',
    });
  });

  it('una clave por proyecto', () => {
    expect(viewStorageKey('TK')).toBe('tk.tablero.vista.TK');
  });
});
