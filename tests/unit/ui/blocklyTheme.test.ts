import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as Blockly from 'blockly/core';
import { BLOCKLY_THEMES, BLOCKLY_PALETTE } from '../../../src/ui/blocklyTheme';
const css = readFileSync('src/styles/tokens.css', 'utf8');
describe('BLK-1 official theme boundary', () => {
    it('uses the existing Bento token surfaces for both palettes', () => {
        const [dark, light] = css.split(':root[data-theme="light"]');
        for (const [mode, section] of [['dark', dark], ['light', light]] as const) {
            const p = BLOCKLY_PALETTE[mode];
            for (const [key, value] of [['bg-panel', p.panel], ['text-1', p.text], ['accent', p.accent]])
                expect(section).toContain(`--${key}: ${value}`);
            expect(BLOCKLY_THEMES[mode].getComponentStyle('workspaceBackgroundColour')).toBe(p.workspace);
            expect(BLOCKLY_THEMES[mode].getComponentStyle('flyoutOpacity')).toBe('1');
        }
    });
    it('keeps Classic block styles and font metrics while using separate cached themes', () => {
        expect(BLOCKLY_THEMES.dark).not.toBe(BLOCKLY_THEMES.light);
        expect(BLOCKLY_THEMES.dark.blockStyles).toEqual(Blockly.Themes.Classic.blockStyles);
        expect(BLOCKLY_THEMES.light.fontStyle).toEqual(Blockly.Themes.Classic.fontStyle);
    });
    it('the installed ThemeChange is a UI-only event, excluded by the existing draft listener', () => { expect(new Blockly.Events.ThemeChange('gui-maker-dark', 'ws').isUiEvent).toBe(true); });
});
