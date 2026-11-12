import { registerBranchBlocks } from './branchBlocks';
import { TYPED_EVENTS, RUNTIME_PROPERTIES, isTypedEventSource, isRuntimePropertyTarget } from '../domain/genericBehavior';
import * as Blockly from 'blockly/core';
import { behaviorNodeLabel } from '../domain/behaviorLabels';
import { displayText } from '../domain/model';
import { isSelectionNode, type SelectionNode } from '../domain/selection';
import { isStatusNode } from '../domain/statusIndicator';
import type { GuiProject } from '../domain/schema';

type Screen = GuiProject['screens'][number];
const contexts = new WeakMap<Blockly.Workspace, Screen>();
export const setBlockContext = (workspace: Blockly.Workspace, screen: Screen) => { contexts.set(workspace, screen); };
type Kind = 'source' | 'target' | 'option' | 'condition-option' | 'status' | 'map' | 'event-source' | 'property-target' | 'read-target' | 'visible-target' | 'text-target' | 'exclusive-target' | 'text-map';
/** Preserve an invalid/stale stable value so conversion can diagnose it, rather than silently replacing it. */
class StableDropdown extends Blockly.FieldDropdown {
  protected doClassValidation_(value?: string): string | null { return typeof value === 'string' ? value : null; }
}
function selector(kind: Kind) {
  return new StableDropdown(function () {
    const owner = this.getSourceBlock(), screen = owner ? contexts.get(owner.workspace) : undefined;
    if (!screen) return [['请选择', '']];
    let action: Blockly.Block | null = owner;
    while (action && action.type !== 'gui_set_status' && action.type !== 'gui_set_status_direct' && action.type !== 'gui_action') action = action.getParent();
    const targetId = action?.getFieldValue('TARGET');
    const values = new Map<string, string>();
    for (const node of screen?.nodes ?? []) {
      if ((kind === 'visible-target' && node.type !== 'native_region') || (kind === 'exclusive-target' && node.type !== 'native_region' && node.type !== 'minecraft:creative-tab') || (kind === 'text-target' && node.type === 'minecraft:string-widget')) values.set(node.id, blockNodeLabel(node, screen));
      if (kind === 'event-source') { const event = owner?.getFieldValue('EVENT'); if ((event === 'selection-change' || event === 'slider-change') && isTypedEventSource(node, event)) values.set(node.id, blockNodeLabel(node, screen)); }
      if (kind === 'read-target') { const type = owner?.getFieldValue('TYPE'); if ((type === 'Number' && node.type === 'minecraft:slider') || (type === 'OptionId' && isSelectionNode(node))) values.set(node.id, blockNodeLabel(node, screen)); }
      if (kind === 'property-target') { const property = owner?.getFieldValue('PROPERTY'); if ((property === 'currentStatusId' || property === 'currentValue') && isRuntimePropertyTarget(node, property)) values.set(node.id, blockNodeLabel(node, screen)); }
      if ((kind === 'source' && isSelectionNode(node)) || (kind === 'target' && isStatusNode(node))) values.set(node.id, blockNodeLabel(node, screen));
      if (kind === 'option' && isSelectionNode(node)) for (const option of node.props.options) values.set(option.id, displayText(option.label));
      if (kind === 'condition-option' && isSelectionNode(node)) {
        const root = owner?.workspace.getAllBlocks(false).find(block => block.type === 'gui_on_selection' || block.type === 'gui_on_selection_single' || block.type === 'gui_on_event');
        const sourceIds: string[] = (root?.type === 'gui_on_selection_single' || root?.type === 'gui_on_event') && root.getFieldValue('SOURCE') ? [root.getFieldValue('SOURCE')] : [];
        for (let source = root?.getInputTargetBlock('SOURCES') ?? null; source; source = source.getNextBlock()) if (source.type === 'gui_selection_source') { const sourceId = source.getFieldValue('SOURCE'); if (sourceId) sourceIds.push(sourceId); }
        let comparison = owner?.getParent(); while (comparison && comparison.type !== 'gui_compare' && comparison.type !== 'gui_switch') comparison = comparison.getParent();
        const reads = (comparison?.type === 'gui_switch' ? ['VALUE'] : ['LEFT','RIGHT']).flatMap(name => { const child = comparison?.getInputTargetBlock(name); return child?.type === 'gui_read_control' && child.getFieldValue('TARGET') ? [child.getFieldValue('TARGET') as string] : []; });
        if (reads.length) sourceIds.splice(0, sourceIds.length, ...reads);
        const selectedSources = sourceIds.map(id => screen.nodes.find(candidate => candidate.id === id)).filter((node): node is SelectionNode => !!node && isSelectionNode(node));
        for (const option of node.props.options) if (selectedSources.some(source => source.id === node.id) && selectedSources.every(source => source.props.options.some(item => item.id === option.id))) values.set(option.id, displayText(option.label));
      }
      if (kind === 'status' && isStatusNode(node) && (!targetId || node.id === targetId)) for (const status of node.props.statuses) values.set(status.statusId, displayText(status.label));
    }
    if (kind === 'map') for (const map of screen?.behaviorMaps ?? []) values.set(map.id, `${map.name} · ${map.id}`);
    if (kind === 'text-map') for (const map of screen?.textMappings ?? []) values.set(map.id, `${map.name} · ${map.id} · Text`);
    if (kind === 'option' || kind === 'condition-option' || kind === 'status') {
      const counts = new Map<string, number>(); for (const text of values.values()) counts.set(text, (counts.get(text) ?? 0) + 1);
      for (const [id, text] of values) if ((counts.get(text) ?? 0) > 1) values.set(id, `${text} · ${id}`);
    }
    const current = this.getValue(); if (current && !values.has(current)) values.set(current, `无效引用 · ${current}`);
    return [['请选择', ''], ...[...values].map(([id, text]): [string, string] => [text, id])];
  });
}
function blockNodeLabel(node: Screen['nodes'][number], screen: Screen) {
  const full = behaviorNodeLabel(node, screen), name = node.alias ?? full.split(' · ')[0];
  const duplicate = screen.nodes.filter(candidate => (candidate.alias ?? behaviorNodeLabel(candidate, screen).split(' · ')[0]) === name).length > 1;
  return duplicate ? full : name;
}
function referenceTooltip(block: Blockly.Block) {
  const screen = contexts.get(block.workspace);
  return `Screen: ${screen?.id ?? ''}\n` + block.inputList.flatMap(input => input.fieldRow.filter(field => field.name).map(field => `${field.name}: ${field.getValue()}`)).join('\n');
}
const constantKinds = new WeakMap<Blockly.Block, string>();
function updateConstant(block: Blockly.Block, type: string) {
  if (!block.getInput('CONSTANT_VALUE') || constantKinds.get(block) === type) return;
  constantKinds.set(block, type); block.removeInput('CONSTANT_VALUE');
  const row = block.appendDummyInput('CONSTANT_VALUE');
  if (type === 'Number') row.appendField(new Blockly.FieldNumber(0), 'VALUE');
  else row.appendField<string>(selector(type === 'OptionId' ? 'condition-option' : 'status'), 'VALUE');
  block.outputConnection?.setCheck(type);
}
function updateCompare(block: Blockly.Block, type: string) {
  block.getInput('LEFT')?.connection?.setCheck(type); block.getInput('RIGHT')?.connection?.setCheck(type);
}
function updateProperty(block: Blockly.Block, property: string) {
  const valueType = property === 'currentValue' ? 'Number' : 'StatusId'; block.getInput('VALUE')?.connection?.setCheck(valueType);
  if (!block.getInput('VALUE')) return;
  if (property === 'currentValue' && !block.getInput('MAPPING_ROW')) block.appendDummyInput('MAPPING_ROW').appendField('数值映射').appendField(new Blockly.FieldDropdown([['按范围映射', 'normalize'], ['直接传值', 'direct']]), 'MAPPING');
  else if (property !== 'currentValue' && block.getInput('MAPPING_ROW')) block.removeInput('MAPPING_ROW');
}
let registered = false;
/** Editor-only diagnostics; never writes authority. Duplicate options/targets and stale IDs stay visible. */
function validateExclusiveBlock(block: Blockly.Block) {
  const screen = contexts.get(block.workspace);
  if (!screen) return;
  const options = new Set<string>(), targets = new Set<string>(), problems: string[] = [];
  let count = 0;
  for (let pair = block.getInputTargetBlock('MAPPING'); pair; pair = pair.getNextBlock()) {
    if (pair.type !== 'gui_exclusive_pair') { problems.push('映射条目必须是「选项 → 显示目标」积木'); break; }
    count++;
    if (count > 32) { problems.push('映射最多 32 条'); break; }
    const option = pair.getFieldValue('OPTION'), targetId = pair.getFieldValue('TARGET');
    if (!option) problems.push(`第 ${count} 条缺少选项`);
    else if (options.has(option)) problems.push(`选项 ${option} 重复`);
    if (option) options.add(option);
    const target = targetId ? screen.nodes.find(node => node.id === targetId) : undefined;
    if (!targetId) problems.push(`第 ${count} 条缺少目标`);
    else if (targets.has(targetId)) problems.push(`目标 ${targetId} 重复；一个目标只能对应一个选项`);
    else if (!target) problems.push(`目标 ${targetId} 不存在`);
    else if (target.type === 'native_region' || target.type === 'minecraft:creative-tab') problems.push(`目标 ${targetId} 不支持运行时可见性映射`);
    if (targetId) targets.add(targetId);
  }
  if (!count) problems.push('至少需要一条「选项 → 显示目标」映射');
  const fallback = block.getFieldValue('FALLBACK');
  if (fallback !== 'hide-all' && fallback !== 'keep-current') problems.push('未匹配策略无效');
  block.setWarningText(problems.length ? problems.join('；') : null);
}
export function registerBehaviorBlocks() {
  if (registered) return; registered = true;
  registerBranchBlocks();
  Blockly.Blocks.gui_on_event = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('当').appendField(new Blockly.FieldDropdown(Object.entries(TYPED_EVENTS).map(([id, spec]) => [spec.label, id])), 'EVENT').appendField('来源').appendField<string>(selector('event-source'), 'SOURCE');
    this.appendStatementInput('DO').setCheck('GuiAction').appendField('依次执行'); this.setColour(210); this.setTooltip(() => referenceTooltip(this));
  } };
  Blockly.Blocks.gui_event_value = {
    saveExtraState(this: Blockly.Block) { return { field: this.getFieldValue('FIELD') }; },
    loadExtraState(this: Blockly.Block, state: { field?: string }) { if (typeof state.field === 'string') this.setFieldValue(state.field, 'FIELD'); },
    init(this: Blockly.Block) {
    const owner = this;
    this.appendDummyInput().appendField('当前事件的').appendField(new Blockly.FieldDropdown([['选项身份', 'optionId'], ['数值', 'value']], value => { owner.outputConnection?.setCheck(value === 'value' ? 'Number' : 'OptionId'); return value; }), 'FIELD');
    this.setOutput(true, 'OptionId'); this.setColour(270); this.setTooltip(() => referenceTooltip(this));
  } };
  Blockly.Blocks.gui_constant = {
    saveExtraState(this: Blockly.Block) { return { valueType: this.getFieldValue('TYPE') }; },
    loadExtraState(this: Blockly.Block, state: { valueType?: string }) { if (typeof state.valueType === 'string') this.setFieldValue(state.valueType, 'TYPE'); },
    init(this: Blockly.Block) {
    const owner = this;
    this.appendDummyInput().appendField('常量').appendField(new Blockly.FieldDropdown([['数值', 'Number'], ['选项身份', 'OptionId'], ['状态身份', 'StatusId']], value => { updateConstant(owner, value); return value; }), 'TYPE');
    this.appendDummyInput('CONSTANT_VALUE'); this.setOutput(true, 'Number'); updateConstant(this, 'Number'); this.setColour(270); this.setTooltip(() => referenceTooltip(this));
  } };
  Blockly.Blocks.gui_read_control = {
    saveExtraState(this: Blockly.Block) { return { valueType: this.getFieldValue('TYPE') }; },
    loadExtraState(this: Blockly.Block, state: { valueType?: string }) { if (state.valueType) this.setFieldValue(state.valueType, 'TYPE'); },
    init(this: Blockly.Block) {
      const owner = this;
      this.appendDummyInput().appendField('读取').appendField(new Blockly.FieldDropdown([['当前数值', 'Number'], ['当前选项', 'OptionId']], value => { owner.outputConnection?.setCheck(value); return value; }), 'TYPE').appendField('控件').appendField<string>(selector('read-target'), 'TARGET');
      this.setOutput(true, 'Number'); this.setColour(270); this.setTooltip(() => referenceTooltip(this));
    },
  };
  Blockly.Blocks.gui_compare = {
    saveExtraState(this: Blockly.Block) { return { valueType: this.getFieldValue('TYPE') }; },
    loadExtraState(this: Blockly.Block, state: { valueType?: string }) { if (typeof state.valueType === 'string') this.setFieldValue(state.valueType, 'TYPE'); },
    init(this: Blockly.Block) {
    const owner = this;
    this.appendDummyInput().appendField('比较').appendField(new Blockly.FieldDropdown([['数值', 'Number'], ['选项身份', 'OptionId']], value => { updateCompare(owner, value); return value; }), 'TYPE');
    this.appendValueInput('LEFT').setCheck('Number').appendField('左值');
    this.appendDummyInput().appendField<string>(new StableDropdown(function () {
      const type = this.getSourceBlock()?.getFieldValue('TYPE');
      const pairs: [string, string][] = [['等于', 'equals'], ['不等于', 'not-equals']];
      if (type === 'Number') pairs.push(['大于', 'greater-than'], ['小于', 'less-than'], ['大于等于', 'greater-or-equal'], ['小于等于', 'less-or-equal']);
      const current = this.getValue(); if (current && !pairs.some(pair => pair[1] === current)) pairs.push([`不兼容操作符 · ${current}`, current]); return pairs;
    }), 'OPERATOR');
    this.appendValueInput('RIGHT').setCheck('Number').appendField('右值'); this.setOutput(true, 'Boolean'); this.setColour(285); this.setTooltip(() => referenceTooltip(this));
  } };
  for (const [type, label] of [['gui_and', '且'], ['gui_or', '或']] as const) {
    Blockly.Blocks[type] = {
      saveExtraState(this: Blockly.Block) { return { count: this.inputList.filter(input => input.name.startsWith('C')).length }; },
      loadExtraState(this: Blockly.Block, state: { count?: number }) {
        const count = Math.max(2, Math.min(32, Number.isInteger(state.count) ? state.count! : 2));
        for (let i = 2; i < count; i++) if (!this.getInput(`C${i}`)) this.appendValueInput(`C${i}`).setCheck('Boolean').appendField(label);
      },
      init(this: Blockly.Block) {
        this.appendValueInput('C0').setCheck('Boolean').appendField(label);
        this.appendValueInput('C1').setCheck('Boolean').appendField(label);
        this.setOutput(true, 'Boolean'); this.setColour(285);
        this.setTooltip(type === 'gui_and' ? '从左到右求值；首个 false 后短路。' : '从左到右求值；首个 true 后短路。');
      },
    };
  }
  Blockly.Blocks.gui_not = { init(this: Blockly.Block) {
    this.appendValueInput('CONDITION').setCheck('Boolean').appendField('非'); this.setOutput(true, 'Boolean'); this.setColour(285);
    this.setTooltip('仅求值一次并取反；非法结果不会变成 true。');
  } };
  Blockly.Blocks.gui_action = {
    saveExtraState(this: Blockly.Block) { return { property: this.getFieldValue('PROPERTY') }; },
    loadExtraState(this: Blockly.Block, state: { property?: string }) { if (typeof state.property === 'string') this.setFieldValue(state.property, 'PROPERTY'); },
    init(this: Blockly.Block) {
    const owner = this;
    this.appendValueInput('VALUE').setCheck('StatusId').appendField('设置').appendField(new Blockly.FieldDropdown(Object.entries(RUNTIME_PROPERTIES).map(([id, spec]) => [spec.label, id]), value => { updateProperty(owner, value); return value; }), 'PROPERTY').appendField('控件').appendField<string>(selector('property-target'), 'TARGET').appendField('为');
    this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction'); this.setColour(150); this.setTooltip(() => referenceTooltip(this) + (this.getFieldValue('PROPERTY') === 'currentValue' ? '\n当前进度值仅接受本次事件数值；Number 常量用于比较。' : ''));
  } };
  Blockly.Blocks.gui_on_selection_single = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('当').appendField<string>(selector('source'), 'SOURCE').appendField('确认改变选择时');
    this.appendStatementInput('DO').setCheck('GuiAction').appendField('执行'); this.setColour(210);
    this.setTooltip(() => referenceTooltip(this));
  } };
  Blockly.Blocks.gui_if_selection = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('如果当前选择是').appendField<string>(selector('condition-option'), 'OPTION');
    this.appendStatementInput('THEN').setCheck('GuiAction').appendField('那么');
    this.appendStatementInput('ELSE').setCheck('GuiAction').appendField('否则');
    this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction'); this.setColour(45);
    this.setTooltip(() => referenceTooltip(this));
  } };
  Blockly.Blocks.gui_set_status_direct = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('将').appendField<string>(selector('target'), 'TARGET').appendField('设为').appendField<string>(selector('status'), 'STATUS');
    this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction'); this.setColour(150);
    this.setTooltip(() => referenceTooltip(this));
  } };
  Blockly.Blocks.gui_on_selection = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('任一来源确认选择变化时');
    this.appendStatementInput('SOURCES').setCheck('GuiSource').appendField('来源');
    this.appendStatementInput('DO').setCheck('GuiAction').appendField('依次执行'); this.setColour(210);
  } };
  Blockly.Blocks.gui_selection_source = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('选择控件').appendField<string>(selector('source'), 'SOURCE'); this.setTooltip(() => referenceTooltip(this));
    this.setPreviousStatement(true, 'GuiSource'); this.setNextStatement(true, 'GuiSource'); this.setColour(210);
  } };
  Blockly.Blocks.gui_event_option = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('当前事件已确认的 optionId'); this.setOutput(true, 'OptionId'); this.setColour(270);
  } };
  Blockly.Blocks.gui_if_option = { init(this: Blockly.Block) {
    this.appendValueInput('EVENT').setCheck('OptionId').appendField('比较当前事件 optionId');
    this.appendDummyInput().appendField('与').appendField<string>(selector('condition-option'), 'OPTION').appendField(new Blockly.FieldDropdown([['等于', 'equals'], ['不等于', 'not-equals']]), 'OPERATOR');
    this.setOutput(true, 'Boolean'); this.setColour(285);
  } };
  Blockly.Blocks.gui_if = { init(this: Blockly.Block) {
    this.appendValueInput('CONDITION').setCheck('Boolean').appendField('如果');
    this.appendStatementInput('THEN').setCheck('GuiAction').appendField('那么');
    this.appendStatementInput('ELSE').setCheck('GuiAction').appendField('否则');
    this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction'); this.setColour(45);
  } };
  Blockly.Blocks.gui_status_map = { init(this: Blockly.Block) {
    this.appendValueInput('OPTION').setCheck('OptionId').appendField('将');
    this.appendStatementInput('PAIRS').setCheck('GuiMapping').appendField('按 ID 映射状态'); this.setOutput(true, 'StatusId'); this.setColour(270);
  } };
  Blockly.Blocks.gui_shared_status_map = { init(this: Blockly.Block) {
    this.appendValueInput('OPTION').setCheck('OptionId').appendField('使用共享映射').appendField<string>(selector('map'), 'MAP').appendField('查询当前 optionId');
    this.setOutput(true, 'StatusId'); this.setColour(285);
  } };
  Blockly.Blocks.gui_mapping_pair = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('选项').appendField<string>(selector('option'), 'OPTION').appendField('→ 状态').appendField<string>(selector('status'), 'STATUS');
    this.setPreviousStatement(true, 'GuiMapping'); this.setNextStatement(true, 'GuiMapping'); this.setColour(270);
  } };
  Blockly.Blocks.gui_set_status = { init(this: Blockly.Block) {
    this.appendValueInput('VALUE').setCheck('StatusId').appendField('设置指示器').appendField<string>(selector('target'), 'TARGET').appendField('的状态'); this.setTooltip(() => referenceTooltip(this));
    this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction'); this.setColour(150);
  } };
  Blockly.Blocks.gui_set_visible = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('设置可见性').appendField<string>(selector('visible-target'), 'TARGET').appendField(new Blockly.FieldDropdown([['显示', 'true'], ['隐藏', 'false']]), 'VISIBLE');
    this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction'); this.setColour(150);
    this.setTooltip('修改当前 Screen 会话可见性。隐藏容器会隐藏子控件，保留输入值。活动 Page 和祖先可见性仍共同约束显示。');
  } };
  Blockly.Blocks.gui_set_text = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('设置显示文本').appendField<string>(selector('text-target'), 'TARGET');
    this.appendValueInput('VALUE').setCheck('Text').appendField('为').appendField(new Blockly.FieldTextInput(''), 'TEXT');
    this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction'); this.setColour(150);
    this.setTooltip('更新 StringWidget 当前会话的显示文本。可直接填写静态文本，或连接 Lookup / Text 常量；程序化赋值不派发新事件。');
  } };
  Blockly.Blocks.gui_lookup = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('Lookup').appendField<string>(selector('text-map'), 'MAPPING');
    this.appendValueInput('INPUT').setCheck('OptionId').appendField('using');
    this.setOutput(true, 'Text'); this.setColour(200);
    this.setTooltip('按映射定义把 OptionId 输入转换为 Literal / Translatable 文本。纯值计算：不修改状态、不触发事件、不自动订阅输入控件。');
  } };
  Blockly.Blocks.gui_text_constant = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('Translatable 文本').appendField(new Blockly.FieldTextInput(''), 'KEY').appendField('fallback').appendField(new Blockly.FieldTextInput(''), 'FALLBACK');
    this.setOutput(true, 'Text'); this.setColour(270);
    this.setTooltip('翻译键由 Minecraft 本地化系统解析；浏览器预览显示 fallback 并标注 ⟦key⟧。');
  } };
  Blockly.Blocks.gui_exclusive_visible = {
    onchange(this: Blockly.Block) { validateExclusiveBlock(this); },
    init(this: Blockly.Block) {
      this.appendValueInput('VALUE').setCheck('OptionId').appendField('互斥显示：读取');
      this.appendStatementInput('MAPPING').setCheck('GuiExclusiveMapping').appendField('映射 选项 → 目标');
      this.appendDummyInput().appendField('未匹配时').appendField(new Blockly.FieldDropdown([['隐藏全部映射目标', 'hide-all'], ['保持现状', 'keep-current']]), 'FALLBACK');
      this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction'); this.setColour(150);
      this.setTooltip('按读取到的 optionId 匹配一条映射：只显示该目标，并隐藏映射表内其余目标。映射表外的节点不受影响；活动 Page 与祖先可见性仍共同约束显示。');
    },
  };
  Blockly.Blocks.gui_exclusive_pair = {
    onchange(this: Blockly.Block) { const parent = this.getParent(); if (parent?.type === 'gui_exclusive_visible') validateExclusiveBlock(parent); },
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('选项').appendField<string>(selector('option'), 'OPTION').appendField('→ 显示目标').appendField<string>(selector('exclusive-target'), 'TARGET');
      this.setPreviousStatement(true, 'GuiExclusiveMapping'); this.setNextStatement(true, 'GuiExclusiveMapping'); this.setColour(270);
      this.setTooltip(() => referenceTooltip(this));
    },
  };
}
export const behaviorToolbox = { kind: 'flyoutToolbox', contents: [
  { kind: 'label', text: '属性组显示与文本' }, { kind: 'block', type: 'gui_set_visible' }, { kind: 'block', type: 'gui_set_text' },
  { kind: 'label', text: '命名映射 Lookup' }, { kind: 'block', type: 'gui_lookup' }, { kind: 'block', type: 'gui_text_constant' },
  { kind: 'label', text: '互斥可见性映射' }, { kind: 'block', type: 'gui_exclusive_visible' }, { kind: 'block', type: 'gui_exclusive_pair' },
  { kind: 'label', text: '通用类型化行为' }, ...['gui_on_event', 'gui_event_value', 'gui_constant', 'gui_read_control', 'gui_compare', 'gui_and', 'gui_or', 'gui_not', 'gui_if', 'gui_if_chain', 'gui_switch', 'gui_action'].map(type => ({ kind: 'block', type })),
  { kind: 'label', text: '快捷条件行为' }, { kind: 'block', type: 'gui_on_selection_single' }, { kind: 'block', type: 'gui_if_selection' }, { kind: 'block', type: 'gui_set_status_direct' },
  { kind: 'label', text: '完整事件与来源' }, { kind: 'block', type: 'gui_on_selection' }, { kind: 'block', type: 'gui_selection_source' },
  { kind: 'label', text: '有限条件与状态动作' }, { kind: 'block', type: 'gui_if' }, { kind: 'block', type: 'gui_if_option' }, { kind: 'block', type: 'gui_set_status' }, { kind: 'block', type: 'gui_status_map' },
  { kind: 'block', type: 'gui_event_option' }, { kind: 'block', type: 'gui_mapping_pair' }, { kind: 'block', type: 'gui_shared_status_map' },
] };
