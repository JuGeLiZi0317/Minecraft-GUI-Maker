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
});
