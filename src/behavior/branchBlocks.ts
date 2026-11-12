import * as Blockly from 'blockly/core';

type BranchBlock = Blockly.Block & {
  branchCount_: number;
  fallback_: boolean;
  updateShape_(): void;
};
type BranchItem = Blockly.Block & {
  valueConnection_?: Blockly.Connection | null;
  actionConnection_?: Blockly.Connection | null;
};

/** Native Blockly mutators keep each branch's value and action stack together while reordering. */
export function registerBranchBlocks() {
  Blockly.Blocks.gui_branch_container = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('分支顺序');
    this.appendStatementInput('STACK'); this.setColour(45); this.contextMenu = false;
  } };
  Blockly.Blocks.gui_branch_item = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('条件 / Case');
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(45); this.contextMenu = false;
  } };
  Blockly.Blocks.gui_branch_default = { init(this: Blockly.Block) {
    this.appendDummyInput().appendField('Else / Default');
    this.setPreviousStatement(true); this.setColour(45); this.contextMenu = false;
  } };
  for (const type of ['gui_if_chain', 'gui_switch'] as const) {
    const isSwitch = type === 'gui_switch';
    const mutator = `${type}_mutator`;
    Blockly.Extensions.registerMutator(mutator, {
      branchCount_: 1,
      fallback_: false,
      saveExtraState(this: BranchBlock) {
        return { count: this.branchCount_, hasDefault: this.fallback_, ...(isSwitch ? { valueType: this.getFieldValue('TYPE') } : {}) };
      },
      loadExtraState(this: BranchBlock, state: { count?: number; hasDefault?: boolean; valueType?: string }) {
        if (!Number.isInteger(state.count) || state.count! < 1 || state.count! > 16) throw new Error('分支数量必须为 1–16');
        this.branchCount_ = state.count!; this.fallback_ = state.hasDefault === true;
        if (isSwitch && (state.valueType === 'Number' || state.valueType === 'OptionId')) this.setFieldValue(state.valueType, 'TYPE');
        this.updateShape_();
      },
      updateShape_(this: BranchBlock) {
        for (const input of [...this.inputList]) if (/^(CASE|CONDITION|DO)\d+$|^FALLBACK$/.test(input.name)) this.removeInput(input.name);
        const check = isSwitch ? this.getFieldValue('TYPE') : 'Boolean';
        this.getInput('VALUE')?.connection?.setCheck(check);
        for (let i = 0; i < this.branchCount_; i++) {
          this.appendValueInput(`${isSwitch ? 'CASE' : 'CONDITION'}${i}`).setCheck(check).appendField(isSwitch ? `Case ${i + 1}` : i ? `Else If ${i}` : 'If');
          this.appendStatementInput(`DO${i}`).setCheck('GuiAction').appendField('执行');
        }
        if (this.fallback_) this.appendStatementInput('FALLBACK').setCheck('GuiAction').appendField(isSwitch ? 'Default' : 'Else');
      },
      decompose(this: BranchBlock, workspace: Blockly.Workspace) {
        const container = workspace.newBlock('gui_branch_container');
        (container as Blockly.BlockSvg).initSvg?.();
        let connection = container.getInput('STACK')!.connection!;
        for (let i = 0; i < this.branchCount_ + Number(this.fallback_); i++) {
          const item = workspace.newBlock(i < this.branchCount_ ? 'gui_branch_item' : 'gui_branch_default');
          (item as Blockly.BlockSvg).initSvg?.(); connection.connect(item.previousConnection!);
          if (item.nextConnection) connection = item.nextConnection;
        }
        return container;
      },
      saveConnections(this: BranchBlock, container: Blockly.Block) {
        let index = 0;
        for (let item = container.getInputTargetBlock('STACK') as BranchItem | null; item; item = item.getNextBlock() as BranchItem | null) {
          item.valueConnection_ = this.getInput(`${isSwitch ? 'CASE' : 'CONDITION'}${index}`)?.connection?.targetConnection;
          item.actionConnection_ = this.getInput(item.type === 'gui_branch_default' ? 'FALLBACK' : `DO${index++}`)?.connection?.targetConnection;
        }
      },
      compose(this: BranchBlock, container: Blockly.Block) {
        const items: BranchItem[] = [];
        let fallback: BranchItem | undefined;
        for (let item = container.getInputTargetBlock('STACK') as BranchItem | null; item; item = item.getNextBlock() as BranchItem | null) {
          if (item.type === 'gui_branch_default') fallback = item;
          else items.push(item);
        }
        // Reject an invalid draft without truncating or destroying connected action stacks.
        if (!items.length || items.length > 16) { this.setWarningText('需要 1–16 个条件 / Case 分支'); return; }
        this.setWarningText(null); this.branchCount_ = items.length; this.fallback_ = !!fallback;
        this.updateShape_();
        items.forEach((item, i) => {
          if (item.valueConnection_) this.getInput(`${isSwitch ? 'CASE' : 'CONDITION'}${i}`)!.connection!.connect(item.valueConnection_);
          if (item.actionConnection_) this.getInput(`DO${i}`)!.connection!.connect(item.actionConnection_);
        });
        if (fallback?.actionConnection_) this.getInput('FALLBACK')!.connection!.connect(fallback.actionConnection_);
      },
    }, undefined, ['gui_branch_item', 'gui_branch_default']);
    Blockly.Blocks[type] = { init(this: BranchBlock) {
      if (isSwitch) {
        this.appendValueInput('VALUE').setCheck('OptionId').appendField('Switch').appendField(new Blockly.FieldDropdown([['选项身份', 'OptionId'], ['数值', 'Number']], value => {
          this.getInput('VALUE')?.connection?.setCheck(value);
          for (const input of this.inputList) if (/^CASE\d+$/.test(input.name)) input.connection?.setCheck(value);
          return value;
        }), 'TYPE');
      }
      this.setPreviousStatement(true, 'GuiAction'); this.setNextStatement(true, 'GuiAction');
      this.setInputsInline(false); this.setColour(45);
      Blockly.Extensions.apply(mutator, this, true); this.updateShape_();
      this.setTooltip('齿轮中增删或拖动分支排序。只执行首个匹配分支。删除分支会保留游离积木，保存前需重新连接或删除。');
    } };
  }
}
