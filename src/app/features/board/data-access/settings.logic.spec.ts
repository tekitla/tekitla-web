import { describe, expect, it } from 'vitest';

import type { Status } from '@/app/api';
import {
  addStatus,
  destinationsFor,
  draftFrom,
  draftProblems,
  isDirty,
  isLastOfCategory,
  moveStatus,
  nameError,
  rebaseDraft,
  removeStatus,
  setDestination,
  toBatchRequest,
  undoRemove,
  updateStatus,
} from './settings.logic';

const status = (id: string, category: Status['category']): Status => ({
  id,
  projectId: 'p1',
  name: id,
  category,
  rank: id,
  color: 'LABEL_COLOR_UNSPECIFIED',
  wipLimit: 0,
  hidden: category === 'ISSUE_STATE_CANCELED',
});

const statuses = [
  status('todo', 'ISSUE_STATE_TODO'),
  status('doing', 'ISSUE_STATE_IN_PROGRESS'),
  status('review', 'ISSUE_STATE_IN_PROGRESS'),
  status('done', 'ISSUE_STATE_DONE'),
  status('canceled', 'ISSUE_STATE_CANCELED'),
];

const ids = (draft: ReturnType<typeof draftFrom>) => draft.statuses.map((s) => s.key);

describe('settings.logic', () => {
  it('nameError: obligatorio, máximo 40 y único sin distinguir mayúsculas', () => {
    expect(nameError('  ', statuses)).toBe('required');
    expect(nameError('x'.repeat(41), statuses)).toBe('tooLong');
    expect(nameError('ñ'.repeat(40), statuses)).toBeNull();
    expect(nameError(' DOING ', statuses)).toBe('taken');
    expect(nameError('Doing', statuses, 'doing')).toBeNull(); // renombrar el mismo
    expect(nameError('Testing', statuses)).toBeNull();
  });

  describe('borrador de estados', () => {
    it('sin cambios no está sucio; editar, mover o agregar sí', () => {
      const draft = draftFrom(statuses);
      expect(isDirty(draft, statuses)).toBe(false);
      expect(isDirty(updateStatus(draft, 'doing', { wipLimit: 3 }), statuses)).toBe(true);
      expect(isDirty(moveStatus(draft, 'doing', 1), statuses)).toBe(true);
      expect(isDirty(addStatus(draft, 'QA', 'ISSUE_STATE_IN_PROGRESS'), statuses)).toBe(true);
    });

    it('mover respeta los bordes', () => {
      const draft = draftFrom(statuses);
      expect(ids(moveStatus(draft, 'doing', 1))).toEqual([
        'todo',
        'review',
        'doing',
        'done',
        'canceled',
      ]);
      expect(moveStatus(draft, 'todo', -1)).toBe(draft);
      expect(moveStatus(draft, 'canceled', 1)).toBe(draft);
    });

    it('un estado nuevo de descarte nace oculto y sin color propio', () => {
      const draft = addStatus(draftFrom(statuses), ' No se hará ', 'ISSUE_STATE_CANCELED');
      expect(draft.statuses.at(-1)).toMatchObject({
        id: '',
        name: 'No se hará',
        color: 'LABEL_COLOR_UNSPECIFIED',
        hidden: true,
      });
    });

    it('quitar uno nuevo lo saca sin borrado; uno guardado sugiere destino de su categoría', () => {
      let draft = addStatus(draftFrom(statuses), 'QA', 'ISSUE_STATE_IN_PROGRESS');
      const fresh = draft.statuses.at(-1)!.key;
      draft = removeStatus(draft, fresh);
      expect(draft.removed).toEqual([]);

      draft = removeStatus(draft, 'review');
      expect(draft.removed).toEqual([
        expect.objectContaining({ moveToStatusId: 'doing', index: 2 }),
      ]);
    });

    it('el destino es un estado guardado que se queda, nunca uno nuevo', () => {
      const draft = addStatus(draftFrom(statuses), 'QA', 'ISSUE_STATE_IN_PROGRESS');
      expect(destinationsFor(draft, 'review').map((s) => s.id)).toEqual([
        'todo',
        'doing',
        'done',
        'canceled',
      ]);
    });

    it('si se quita el destino de otro borrado, ese recibe uno nuevo', () => {
      let draft = removeStatus(draftFrom(statuses), 'review');
      expect(draft.removed[0]!.moveToStatusId).toBe('doing');
      draft = addStatus(draft, 'QA', 'ISSUE_STATE_IN_PROGRESS');
      draft = removeStatus(draft, 'doing');
      expect(draft.removed.map((r) => r.moveToStatusId)).toEqual(['todo', 'todo']);
      expect(draftProblems(draft)).toEqual([]);
    });

    it('deshacer un borrado lo devuelve a su lugar', () => {
      const draft = undoRemove(removeStatus(draftFrom(statuses), 'review'), 'review');
      expect(ids(draft)).toEqual(ids(draftFrom(statuses)));
      expect(draft.removed).toEqual([]);
    });

    it('problemas: nombres, último de su categoría, máximo y destino', () => {
      let draft = updateStatus(draftFrom(statuses), 'doing', { name: 'REVIEW' });
      draft = updateStatus(draft, 'todo', { name: ' ' });
      draft = removeStatus(draft, 'done');
      expect(draftProblems(draft)).toEqual([
        { kind: 'name', key: 'todo', error: 'required' },
        { kind: 'name', key: 'doing', error: 'taken' },
        { kind: 'name', key: 'review', error: 'taken' },
        { kind: 'lastOfCategory', category: 'ISSUE_STATE_DONE' },
      ]);
      expect(isLastOfCategory(draftFrom(statuses), 'todo')).toBe(true);
      expect(isLastOfCategory(draftFrom(statuses), 'doing')).toBe(false);

      let many = draftFrom(statuses);
      for (let i = 0; i < 16; i++) many = addStatus(many, `E${i}`, 'ISSUE_STATE_TODO');
      expect(draftProblems(many)).toEqual([{ kind: 'tooMany' }]);

      const lost = setDestination(removeStatus(draftFrom(statuses), 'review'), 'review', 'x');
      expect(draftProblems(lost)).toEqual([{ kind: 'destination', statusId: 'review' }]);
    });

    it('toBatchRequest: lista completa en orden, hidden explícito y borrados con destino', () => {
      let draft = updateStatus(draftFrom(statuses), 'doing', {
        name: ' En curso ',
        color: 'LABEL_COLOR_WARNING',
        wipLimit: 3,
      });
      draft = removeStatus(draft, 'review');
      draft = addStatus(draft, 'QA', 'ISSUE_STATE_IN_PROGRESS');
      const req = toBatchRequest(draft);
      expect(req.statuses.map((s) => s.id)).toEqual(['todo', 'doing', 'done', 'canceled', '']);
      expect(req.statuses[1]).toEqual({
        id: 'doing',
        name: 'En curso',
        category: 'ISSUE_STATE_IN_PROGRESS',
        color: 'LABEL_COLOR_WARNING',
        wipLimit: 3,
        hidden: false,
      });
      expect(req.statuses[3]).toMatchObject({ hidden: true });
      expect(req.deletions).toEqual([{ statusId: 'review', moveToStatusId: 'doing' }]);
    });

    it('rebaseDraft: conserva lo propio, suelta lo que otro borró y suma lo que otro creó', () => {
      let draft = updateStatus(draftFrom(statuses), 'doing', { wipLimit: 2 });
      draft = addStatus(draft, 'QA', 'ISSUE_STATE_IN_PROGRESS');
      draft = removeStatus(draft, 'done');
      // Otro borró «review» y creó «Bloqueado».
      const fresh = [
        ...statuses.filter((s) => s.id !== 'review'),
        status('blocked', 'ISSUE_STATE_IN_PROGRESS'),
      ];
      const rebased = rebaseDraft(draft, fresh);
      expect(rebased.statuses.map((s) => s.id || s.name)).toEqual([
        'todo',
        'doing',
        'canceled',
        'QA',
        'blocked',
      ]);
      expect(rebased.statuses[1]!.wipLimit).toBe(2);
      expect(rebased.removed.map((r) => r.status.id)).toEqual(['done']);
    });
  });
});
