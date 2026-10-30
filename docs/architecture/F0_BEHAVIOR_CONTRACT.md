# F0 行为规格与导出命名合同

> F2 已调整引用删除策略并增加有序动作；现行规则见 [F2 合同](F2_ORDERED_BEHAVIOR_CONTRACT.md)，下文级联删除及单动作限制为历史。

2026-10-29。F0 是用户体验原型，不是完整行为系统或游戏运行时。项目 Schema 0.6.0 的 `screens[0].behaviors` 包含最多 200 条规则，每条是严格对象 `{id,event,action}`：事件为 `button-click` 或 `checkbox-change`，带 `sourceId`；动作是 `set-text`（`targetId`、最多 4096 UTF-16 单元的 `text`）或 `set-visible`（`targetId`、布尔 `visible`）。两种事件均可配两种动作；其他事件、动作、参数及引用类型均拒绝。事件来源必须分别是 Button 或 Checkbox；设置文本的目标必须是 StringWidget，可见性目标可以是现有任意节点。所有 ID 全局唯一。

首条规则的保存与 Schema 升级在同一历史事务；0.1.0–0.5.0 规则数组必须为空，读取旧项目不迁移。0.6.0 兼容既有 Panel、H1 和阴影。删除被引用组件时，在同一事务中删除引用它的规则；撤销恢复二者。规则和文档按既有历史、IndexedDB 和严格原子导入处理。

「行为」区采用表单保存单事件、单动作规则。测试按钮模拟指定来源的事件，Checkbox 同时切换临时勾选值；规则以数组顺序应用到临时文本和可见性。动作不会递归触发其他事件，也没有条件、循环、变量或网络。更改文档、关闭行为区或重置会清除预览。预览不写入领域文档、历史、IndexedDB、PNG 或其他导出；状态不与 Minecraft 或服务器同步。

导出合同 0.4.0 将规则写入权威 JSON、结构化规格、Prompt 和 manifest，ZIP 仍直接使用相同批次的文件。规则是实现意图；Java 回调和状态同步由开发者实现，不生成源码。

本修订取消 0.3.1 文件名中的 revision 和批次短码：`<名称>.zip`、`<名称>.json`、`<名称>.png`、`<名称>.reference.png`、`<名称>.implementation.json`、`<名称>.prompt.md`、`<名称>.manifest.json`，需要 Panel 时还有 `<名称>.background.png`。安全清理和后备名称仍沿用 [0.3.1 合同](D_EXPORT_NAMING_ZIP_CONTRACT.md)。名称可能被重复下载而覆盖或由浏览器改名；批次身份与 SHA-256 仍记录在文件内容，不能仅凭文件名判定同批。
