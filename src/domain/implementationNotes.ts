import type { GuiScreen } from './schema';

export const IMPLEMENTATION_NOTES_MAX = 4096;
export const IMPLEMENTATION_NOTES_CONTRACT = {
  version: '1.0.0',
  field: 'optional implementationNotes UTF-8 string on a Screen or any GuiNode; absent means no note and is never injected into legacy projects',
  maxLength: IMPLEMENTATION_NOTES_MAX,
  scope: {
    screen: 'cross-widget collaboration, data source and Screen lifecycle intent',
    widget: 'ordinary widget/container/Repeatable List/Row Template member responsibility',
    rowTemplate: 'describes the template slot responsibility, not a distinct note per runtime row; row-specific data remains a Java external Row Context integration point',
  },
  precedence: 'The structured Schema, node properties, events and F2 contracts remain authoritative. If a note conflicts with them, report the conflict and do not silently override the structured configuration.',
  security: {
    executable: false,
    externalReferences: false,
    fileWrites: false,
    networkRequests: false,
    codeExecution: false,
    interpretation: 'Notes are inert developer documentation. GUI Maker never parses them into F2 rules, Minecraft registries, server data, business objects or executable scripts.',
  },
  export: {
    authority: 'The note text is preserved verbatim in the authoritative project JSON.',
    specification: 'The Agent Specification groups notes by Screen then by stable node ID, with type and current alias.',
    visual: 'Notes are not rendered in the design canvas, interaction preview, Design PNG or game runtime.',
  },
} as const;

export type ImplementationNoteEntry = { nodeId: string; type: string; alias: string | null; parentContainerId: string | null; note: string };
export function implementationNotesForScreen(screen: GuiScreen) {
  return {
    screenId: screen.id,
    note: screen.implementationNotes ?? null,
    nodes: screen.nodes.flatMap((node): ImplementationNoteEntry[] => node.implementationNotes === undefined ? [] : [{
      nodeId: node.id, type: node.type, alias: node.alias ?? null,
      parentContainerId: node.parentContainerId ?? null, note: node.implementationNotes,
    }]),
  };
}
