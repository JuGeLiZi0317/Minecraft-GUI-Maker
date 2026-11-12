import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { pageExportVariants, MAX_PAGE_VARIANTS } from '../../../src/exports/pageExport';

function projectWithPages(groups: number[]) {
  const project = emptyProject();
  project.schemaVersion = '0.55.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  let index = 0;
  for (const [groupIndex, count] of groups.entries()) {
    for (let page = 0; page < count; page++) {
      const tab = createNode('minecraft:creative-tab', `g${groupIndex}_p${page}`, { x: 10 + index * 30, y: 10 });
      if (tab.type !== 'minecraft:creative-tab') throw new Error('tab');
      tab.props.groupId = `group_${groupIndex}`; tab.props.contentIds = [`content_${groupIndex}_${page}`]; tab.props.selected = page === 0;
      const content = createNode('minecraft:fill', `content_${groupIndex}_${page}`, { x: 20 + index * 30, y: 50 });
      project.screens[0].nodes.push(tab, content); index++;
    }
  }
  return project;
}

describe('Q5-K Page export variants', () => {
  it('exports every Page for a single Page Group and keeps the initial Page canonical', () => {
    const screen = projectWithPages([3]).screens[0];
    const variants = pageExportVariants(screen);
    expect(variants).toHaveLength(3);
    expect(variants.map(variant => variant.id)).toEqual(['g0_p0', 'g0_p1', 'g0_p2']);
    expect(variants.filter(variant => variant.initial)).toHaveLength(1);
    expect(variants[0].selections).toMatchObject({ g0_p0: { tabSelected: true }, g0_p1: { tabSelected: false } });
  });

  it('uses the current combination for multiple Page Groups unless all combinations are requested', () => {
    const screen = projectWithPages([2, 2]).screens[0];
    const current = pageExportVariants(screen, 'auto', { group_0: 'g0_p1', group_1: 'g1_p0' });
    expect(current.map(variant => variant.id)).toEqual(['g0_p0+g1_p0', 'g0_p1+g1_p0']);
    const all = pageExportVariants(screen, 'all');
    expect(all).toHaveLength(4);
    expect(all.filter(variant => variant.initial)).toHaveLength(1);
  });

  it('rejects an excessive all-Page Cartesian product instead of silently truncating', () => {
    const screen = projectWithPages([6, 6, 6]).screens[0];
    expect(() => pageExportVariants(screen, 'all')).toThrow(String(MAX_PAGE_VARIANTS));
  });
});

import { beginExport } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';

describe('Q5-K Page image bundle', () => {
  const png = async () => new Uint8Array([137, 80, 78, 71]);
  it('adds Page image files and manifest/spec entries for all combinations', async () => {
    const snapshot = beginExport(projectWithPages([2, 2]));
    const bundle = await buildBundle(snapshot, png, png, undefined, undefined, { pageMode: 'all' });
    expect(bundle.manifest.screens[0].pages).toHaveLength(4);
    expect(bundle.files.filter(file => file.name.endsWith('.png'))).toHaveLength(8);
    expect(bundle.files.filter(file => file.name.endsWith('.reference.png'))).toHaveLength(4);
    expect(bundle.manifest.pageExportContract.version).toBe('1.0.0');
    const spec = bundle.files.find(file => file.name.endsWith('.implementation.json'))!;
    const parsed = JSON.parse(new TextDecoder().decode(spec.bytes));
    expect(parsed.designIntent.screens[0].pages).toHaveLength(4);
  });
  it('keeps the canonical initial Page pair plus the current combination for multi-group current mode', async () => {
    const snapshot = beginExport(projectWithPages([2, 2]));
    const bundle = await buildBundle(snapshot, png, png, undefined, undefined, { pageMode: 'current', pageSelections: { [snapshot.selectedScreenId]: { group_0: 'g0_p1', group_1: 'g1_p0' } } });
    expect(bundle.manifest.screens[0].pages.map(page => page.pageId)).toEqual(['g0_p0+g1_p0', 'g0_p1+g1_p0']);
    expect(bundle.files.filter(file => file.name.endsWith('.png'))).toHaveLength(4);
  });
});
