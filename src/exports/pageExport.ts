import type { GuiProject, GuiScreen } from '../domain/schema';
import { sameScreenPages } from '../domain/sameScreenPages';
import { screenNavigationSelected } from '../domain/screenTabNavigation';
import { initialControlState } from '../domain/genericBehavior';
import { effectiveRuntimeVisibility } from '../domain/runtimeVisibility';

export const MAX_PAGE_VARIANTS = 100;
export type PageExportMode = 'auto' | 'all' | 'current';
export type PageSelectionState = Record<string, { tabSelected?: boolean }>;

export type PageExportVariant = {
  /** Stable variant identity: one Page ID for a single group, or Page IDs in group order joined by '+'. */
  id: string;
  pageIds: string[];
  groupIds: string[];
  title: string;
  initial: boolean;
  selections: PageSelectionState;
};

type Page = ReturnType<typeof sameScreenPages>[number];

function pageTitle(screen: GuiScreen, page: Page) {
  const node = screen.nodes.find(item => item.id === page.id);
  return node?.type === 'minecraft:creative-tab' ? node.props.name : page.id;
}

function variantFor(screen: GuiScreen, pages: Page[], pageIds: string[], initialIds: string[]): PageExportVariant {
  const selected = new Set(pageIds);
  const selections: PageSelectionState = {};
  for (const page of pages) selections[page.id] = { tabSelected: selected.has(page.id) };
  const ordered = pages.filter(page => selected.has(page.id));
  return {
    id: pageIds.join('+'),
    pageIds: [...pageIds],
    groupIds: ordered.map(page => page.groupId),
    title: ordered.map(page => pageTitle(screen, page)).join(' / '),
    initial: pageIds.length === initialIds.length && pageIds.every((id, index) => id === initialIds[index]),
    selections,
  };
}

/**
 * Page variants are export-only. A Page is always a CreativeTab content page
 * inside one Screen; it never creates another Screen or changes authority JSON.
 */
export function pageExportVariants(screen: GuiScreen, mode: PageExportMode = 'auto', currentPageIds: Record<string, string> = {}): PageExportVariant[] {
  const pages = sameScreenPages(screen);
  if (pages.length <= 1) return [];
  const groups = [...new Set(pages.map(page => page.groupId))];
  const byGroup = new Map(groups.map(group => [group, pages.filter(page => page.groupId === group)]));
  const initialIds = groups.map(group => (byGroup.get(group)!.find(page => page.initial) ?? byGroup.get(group)![0]).id);
  const initial = variantFor(screen, pages, initialIds, initialIds);
  const currentIds = groups.map(group => {
    const requested = currentPageIds[group];
    return byGroup.get(group)!.some(page => page.id === requested) ? requested : initialIds[groups.indexOf(group)];
  });
  const current = variantFor(screen, pages, currentIds, initialIds);
  const effectiveMode: Exclude<PageExportMode, 'auto'> = mode === 'auto' ? (groups.length === 1 ? 'all' : 'current') : mode;

  if (effectiveMode === 'current') return current.initial ? [initial] : [initial, current];

  if (groups.length === 1) return pages.map(page => variantFor(screen, pages, [page.id], initialIds));

  const count = groups.reduce((total, group) => total * byGroup.get(group)!.length, 1);
  if (count > MAX_PAGE_VARIANTS) throw new Error(`全部 Page 组合共有 ${count} 个，超过 ${MAX_PAGE_VARIANTS}；请改用当前 Page 组合或减少 Page Group`);
  let combinations: string[][] = [[]];
  for (const group of groups) combinations = combinations.flatMap(prefix => byGroup.get(group)!.map(page => [...prefix, page.id]));
  const variants = combinations.map(ids => variantFor(screen, pages, ids, initialIds));
  return variants.some(variant => variant.initial) ? variants : [initial, ...variants];
}

export function planPageExports(document: GuiProject, mode: PageExportMode = 'auto', currentPages: Record<string, Record<string, string>> = {}) {
  return new Map(document.screens.map(screen => [screen.id, pageExportVariants(screen, mode, currentPages[screen.id])]));
}

export function resolvePageVisualState(screen: GuiScreen, navigation: NonNullable<GuiProject['screenTabGroups']>, selections?: PageSelectionState) {
  const nodes = screen.nodes.map(node => {
    if (node.type !== 'minecraft:creative-tab') return node;
    const selected = screenNavigationSelected(node, screen.id, navigation) ?? selections?.[node.id]?.tabSelected;
    return selected === undefined ? node : { ...node, props: { ...node.props, selected } };
  });
  return { nodes, isVisible: effectiveRuntimeVisibility(nodes, initialControlState(screen)) };
}

export type PageExportImage = {
  pageId: string;
  groupIds: string[];
  title: string;
  initial: boolean;
  selections: PageSelectionState;
  designFile: string;
  referenceFile: string;
  width: number;
  height: number;
  scale: number;
};

export const PAGE_EXPORT_CONTRACT = {
  version: '1.0.0',
  unit: 'one Page variant per visual reference image; Page variants never create another Screen',
  identity: 'Page ID is the stable CreativeTab node ID; a multi-group variant ID joins the selected Page IDs with + in group order',
  initialAlias: 'screens[].designImage and screens[].enlargedReferenceImage remain the canonical initial-Page files',
  selection: 'single Page Group exports every Page; multiple Page Groups default to the current editor combination, with an explicit all-combinations option capped at 100',
  rendering: 'each variant renders the same immutable project snapshot with a Page selection map; non-selected Pages are hidden exactly as at runtime',
  pageOwnership: 'Page membership remains in sameScreenPages/contentIds; this contract adds images only',
  filenames: 'initial Page keeps the canonical filename; additional variants append the Page title and stable Page ID set',
} as const;
