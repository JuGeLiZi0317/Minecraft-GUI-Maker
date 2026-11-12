import { describe, expect, it } from 'vitest';
import { createNode } from '../../../src/domain/model';
import { nativeTextDiagnostics } from '../../../src/domain/nativeTextCapability';

describe('Q5-A native text capability diagnostics', () => {
  it('flags always-on native shadows, fixed Checkbox color, hardcoded Slider color and Button alpha loss', () => {
    const button = createNode('minecraft:button', 'button_1');
    if (button.type === 'minecraft:button') { button.props.textShadow = false; button.props.color = '#80404040'; }
    const checkbox = createNode('minecraft:checkbox', 'checkbox_1');
    if (checkbox.type === 'minecraft:checkbox') { checkbox.props.color = '#FF404040'; checkbox.props.textShadow = false; }
    const slider = createNode('minecraft:slider', 'slider_1');
    if (slider.type === 'minecraft:slider') { slider.props.textShadow = false; }
    const edit = createNode('minecraft:edit-box', 'edit_1');
    if (edit.type === 'minecraft:edit-box') edit.props.textShadow = false;
    const cycle = createNode('minecraft:cycle-button', 'cycle_1');
    if (cycle.type === 'minecraft:cycle-button') cycle.props.textShadow = false;
    const diagnostics = nativeTextDiagnostics([button, checkbox, slider, edit, cycle]);
    expect(diagnostics.filter(item => item.nodeId === 'edit_1')).toEqual([]);
    expect(diagnostics.map(item => `${item.nodeId}:${item.code}`)).toEqual(expect.arrayContaining([
      'button_1:shadow-always-on', 'button_1:fgcolor-alpha-dropped',
      'checkbox_1:shadow-replace-widget', 'checkbox_1:checkbox-color-fixed',
      'slider_1:shadow-always-on', 'slider_1:slider-color-hardcoded',
      'cycle_1:shadow-replace-widget', 'cycle_1:cycle-label-translation',
    ]));
  });

  it('does not rewrite existing control styles while diagnosing', () => {
    const button = createNode('minecraft:button', 'button_1');
    if (button.type === 'minecraft:button') { button.props.textShadow = false; button.props.color = '#80404040'; }
    const before = structuredClone(button);
    nativeTextDiagnostics([button]);
    expect(button).toEqual(before);
  });
});
