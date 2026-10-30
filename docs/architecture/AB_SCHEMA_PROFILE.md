# A+B 已实施 Schema 子集

2026-10-27。本文补充第一阶段 GUI_SCHEMA_PROPOSAL.md，不把尚未授权的行为/资产能力改称已实现。

实际验证器：`src/domain/schema.ts`。组件目录：`src/domain/catalog.ts`。领域模型由中立数据合同推导，仅依赖 Zod；不引用 React、Konva、Zustand 或 Blockly。Zustand 存储属于 editor 层；Konva 仅 canvas 适配。

## 支持的格式

- format=`minecraft-gui-maker`，schemaVersion=`0.1.0`，catalogVersion=`mc-1.21.1-neoforge-21.1.244-audit-1`。
- target 的 Minecraft 1.21.1、NeoForge 21.1.244、Java 21 和 Java Edition 精确匹配，均不可用版本范围替换。
- 恰好一个 screen，base=screen、placement=center、background.kind=none；designSize 为正安全整数、unit=gui-px。
- nodes 最多1000，只接受 Button / EditBox / StringWidget / fill；source 的 category/className/member 与目录严格匹配。未知类型/来源不被转换成占位组件。
- bounds 使用非负安全整数 x/y，正整数 w/h，必须在设计区内。Button 最低9×9，EditBox最低12×12，其他最低1×1；这些下限是产品策略，非 Minecraft API 声明。自由拖动按整数取整并限制边界；精确输入超界会被拒绝，不自动纠正。
- 各类型 props 封闭校验，Button message/tooltip、EditBox narration/value/maxLength/hint/bordered/editable、StringWidget text/color/align、fill color。TextSpec 支持 literal 和 translate（key/fallback）；颜色要求八位 ARGB。
- StringWidget 与 fill 为装饰节点，仅支持 state.visible；Button 和 EditBox 还支持 state.enabled。StringWidget 虽继承 AbstractWidget，当前规格不开放无业务意义的 enabled。隐藏初态节点在编辑器中保持淡色以便编辑。
- events 只允许目录中对应的字段（Button press、EditBox valueChanged）；当前没有可定义的 behaviors，因此非空事件引用全部作为悬空引用拒绝。
- variables、behaviors、assets 必须为空。资产、AST 编译/执行和积木均未实现。不会为了让完整提案的未来样例“成功”而抹去数据。
- 全局 ID（含 project、screen、nodes）唯一，匹配提案规定的 ID 正则。非法项目不触碰文档、选择、手势或历史。
- 每层核心对象拒绝未知字段；允许可选 extensions，通过反向域名键保存 JSON，原样往返、不执行。最多5 MiB UTF-8 JSON，嵌套最多32层，防止递归校验失控。这是 A+B 的解析限制，不是 AST 深度合同。

## 历史及序列化

文档 JSON 保留原节点数组绘制顺序、ID、属性、来源、版本及 extensions。导入的 revision 原样保留，普通编辑 revision+1；撤销/重做恢复快照的 revision，因此 revision 不承诺整个编辑会话严格递增，也不能替代未来仓储的写入顺序号。

历史快照包含文档和选择，不包含 zoom/pan/DPR。拖动草稿放在 editor.gesture，只有 pointerup 提交；Escape/pointercancel/blur 回滚草稿。resize 使用手动右下角逻辑边界调整，没有 Konva Transformer，也没有 scale 属性转换入领域文档的路径。

交互修订：画布支持双击文字编辑，提交到相同的领域属性，不增加Schema字段。translate模式编辑预览文字时仅改变fallback，保留kind/key；EditBox编辑value。文字草稿为临时DOM状态，Enter/失焦提交一次，Esc取消，不运行组件业务或行为。右键平移、Alt+滚轮缩放只改变视图。UI用“预览文字”替代“回退文字”，JSON兼容字段fallback保持原名。

JSON 校验完成后才一次替换文档与历史。导出也走相同校验入口。若校验失败，原文档与历史完全保留，UI 状态栏单独呈现错误。相同 JSON 的再次有效导入也记录为单独事务；没有变化的普通编辑/手势不产生历史。

首阶段的完整 AST 示例仍是后续提案，不作为 A+B 导入兼容性的承诺。未来扩展本 profile 时须加入能力测试并记录支持范围；不能在当前导入中悄悄接受未知字段或尚未审计的组件。

尺寸与预览修订：designSize已增加UI修改入口，交互输入范围1～8192；超大旧JSON仍按原安全整数合同校验，不静默改写。修改宽高是一条历史事务，缩小导致组件越界时拒绝整次修改。GUI Scale预览参数只存在会话状态，不新增Schema字段。源码规则和窗口适配语义见 `docs/minecraft/GUI_SCALE_AUDIT.md`。

C阶段继续使用相同权威JSON合同。localId、storageRevision、updatedAt、workspace索引及保存状态只属于本地仓储，不进入导出JSON；本地恢复同样走领域校验。撤销可恢复较小领域revision，而仓储保存序号始终独立增加，不能相互替代。
