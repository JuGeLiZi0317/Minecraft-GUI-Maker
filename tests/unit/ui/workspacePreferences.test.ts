import { describe, expect, it } from 'vitest';
import { defaultWorkspace, parseWorkspace } from '../../../src/ui/workspacePreferences';

describe('workspace preferences', () => {
  it('tolerates invalid data and bounds saved values', () => {
    expect(parseWorkspace(null)).toEqual(defaultWorkspace()); expect(parseWorkspace({version:99})).toEqual(defaultWorkspace());
    const result = parseWorkspace({version:1,left:{mode:'auto',width:9000},right:{mode:'bad',width:-10},treeRatio:2});
    expect(result.left).toEqual({mode:'auto',width:640}); expect(result.right).toEqual({mode:'pinned',width:160}); expect(result.treeRatio).toBe(0.8);
    expect(result.smartGuides).toBe(true); expect(result.smartSnap).toBe(true);
    expect(parseWorkspace({version:1,smartGuides:false,smartSnap:false}).smartGuides).toBe(false);
    expect(parseWorkspace({version:1,smartGuides:false,smartSnap:false}).smartSnap).toBe(false);
  });
  it('migrates v1 while preserving independent sidebar settings and validates v2 modules', () => {
    expect(parseWorkspace({version:1,left:{mode:'collapsed',width:310},right:{mode:'auto',width:355},smartGuides:false,smartSnap:false})).toMatchObject({version:2,left:{mode:'collapsed',width:310},right:{mode:'auto',width:355},smartGuides:false,smartSnap:false,openedModules:['structure','components']});
    const parsed=parseWorkspace({version:2,openedModules:['screens','screens','bad'],collapsedModules:{screens:true,structure:'bad'},panelHeights:{screens:-1,structure:9999,components:'bad'}});
    expect(parsed.openedModules).toEqual(['screens']);expect(parsed.collapsedModules).toEqual({screens:true,structure:false,components:false,behavior:false});expect(parsed.panelHeights).toEqual({screens:94,structure:2000,components:300,behavior:300});
    expect(parseWorkspace({version:2,openedModules:[]}).openedModules).toEqual([]);
    const migrated = parseWorkspace({version:1, treeRatio:0.7}); expect(migrated.panelHeights.structure).toBe(364); expect(migrated.panelHeights.components).toBe(156);
  });
});
