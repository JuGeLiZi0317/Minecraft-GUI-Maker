# M1 多 Screen 导出权威合同（建议冻结）

M1-F 更新：入口、生命周期、背景／字体、版本和来源定位以 [M1-F 合同](M1F_RUNTIME_EXPORT_CONTRACT.md) 为准。下文“尚未贯通”为此前实施状态；当前已实现多 Screen 同快照派生导出。

## 权威边界

一个 GUI 项目只有一份权威项目 JSON。`screens[]` 中每项以稳定 Screen ID 描述独立尺寸、Panel、节点、标签组、行为和声明导航目标；组件坐标仍以所属 Screen 左上角为原点。Screen 显示名称、编辑器中的画布位置、当前选择、缩放和平移均不是身份，也不进入权威设计。

`open_screen` 继续引用来源 Screen 内的声明目标 ID。声明目标通过 `boundScreenId` 显式绑定真实 Screen；未绑定声明仍是合法实现意图，但不得凭空产生 Screen、PNG 或运行时导航。重命名声明或真实 Screen 不改变引用。

## 派生产物

多 Screen 批次必须先捕获一次完整项目快照、资源 generation 和字体 generation，再从该快照生成所有产物：

- 项目 JSON：唯一可重新导入的权威文件，包含所有 Screen。
- 每 Screen 参考 PNG／放大 PNG：只读派生物，使用该 Screen 的权威设计初态；不包含行为测试、当前编辑 Screen、多画布摆放或其他会话状态。
- 统一规格与 Prompt：项目级文件，枚举全部真实 Screen、每 Screen 的节点和行为，以及声明目标的绑定状态。节点来源路径必须包含稳定 Screen 身份，不能固定写作 `/screens/0/...`。
- manifest：项目级索引，记录项目 JSON 摘要、每 Screen ID、派生文件名、尺寸、摘要、资源／字体代次和导航绑定；未绑定声明只记录状态，不生成伪 Screen。
- Panel 背景图：按所属 Screen 的设计区全局坐标合同生成，并由 manifest 关联到 Screen ID。

文件名可包含清理后的 Screen 名称以便阅读，但必须加入稳定、无碰撞的 Screen ID 或等价确定性键；显示名称不是内部引用。ZIP 只是同一批次的容器，不建立第二套权威格式。

## 原子性与取消

任一必需 Screen 产物失败，或生成期间资源／字体代次改变，整批失败且不下载部分有效 ZIP。导出不得修改文档 revision、历史、IndexedDB、当前 Screen 或多画布布局。单项 PNG 明确表示“当前 Screen 的派生参考图”；项目 JSON 始终表示整个项目。

## 当前实现状态

Schema 0.12.0 项目 JSON 已能包含全部 Screen。F2 行为测试可解析显式绑定并在临时会话中切换真实 Screen；该切换不写回权威数据。多 Screen PNG、规格、Prompt、manifest 与 ZIP 尚未按本合同贯通，现有保护应继续阻止误导性导出，直至同快照、多 Screen 文件命名和 manifest 全部实现并验证。
