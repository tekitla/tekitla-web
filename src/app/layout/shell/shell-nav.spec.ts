import { describe, expect, it } from 'vitest';

import { ShellNav } from './shell-nav';

describe('ShellNav', () => {
  it('guarda migas y proyecto, y set sin proyecto lo quita', () => {
    const nav = new ShellNav();
    nav.set([{ label: 'Tekitla' }], { id: 'p1', name: 'Tekitla' });
    expect(nav.crumbs()).toEqual([{ label: 'Tekitla' }]);
    expect(nav.project()).toEqual({ id: 'p1', name: 'Tekitla' });

    nav.set([{ label: 'projects.list.title', translate: true }]);
    expect(nav.project()).toBeNull();
  });

  it('clear deja el shell vacío', () => {
    const nav = new ShellNav();
    nav.set([{ label: 'Tekitla' }], { id: 'p1', name: 'Tekitla' });
    nav.clear();
    expect(nav.crumbs()).toEqual([]);
    expect(nav.project()).toBeNull();
  });
});
