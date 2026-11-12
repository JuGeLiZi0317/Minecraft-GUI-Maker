# Minecraft GUI Maker

一个用于设计 Minecraft GUI 的网页编辑器，目标环境为 Minecraft Java 1.21.1、NeoForge 21.1.244 和 Java 21。

项目提供 GUI 设计与 Blockly 行为编辑、本地保存，以及 JSON、参考 PNG、实现规格、Prompt 和 ZIP 导出。权威设计与行为保存在项目 JSON 中；游戏端依据导出的规格实现，不需要安装 Blockly，也不由网页自动生成 Java 源码。

## 当前功能

- Hybrid 工作区：Navigation Rail、可组合模块侧栏、Canvas 与 Inspector；支持侧栏固定/悬停展开、尺寸调整，以及浅色、深色和跟随系统主题。
- 控件别名：所有控件均可在 Inspector 中设置编辑器别名，同步显示于结构树和 Blockly；与游戏文案和稳定 ID 分开保存。
- 组件设计：文本、按钮、输入、滑块、选择控件、进度条、状态指示器、Tree View，以及滚动和折叠容器。
- 选项与本地化：CycleButton、Dropdown、Radio Group 的选项可在 Inspector 中增删、复制、排序并逐项设置稳定 ID 与 Literal / Translatable 文本；被行为规则引用的选项会阻止改名或删除。
- Tree View 与状态：树项稳定 ID、父子层级、排序与 Literal / Translatable 标签可直接编辑；Status Indicator 的状态 ID、名称与可选独立显示文本可编辑，被 `set-status` 或共享映射引用的状态会阻止改名或删除并定位规则。
- 控件 Tooltip：Button、Checkbox、CycleButton、Slider、EditBox、Numeric Input、Radio Group、Dropdown、Tree View、Scrollable/Collapsible Panel 可配置可选控制级 Tooltip（Literal / Translatable）；交互预览与 GUI Scale 预览按裁剪后可见区域悬停显示，Dropdown 浮层与 Native Region/ItemStack 边界明确。
- 本地化资源：Bake / Assets 的 Localization 区块收集项目内全部 Translatable TextSpec，管理 zh_cn / en_us 等译文并生成标准 `assets/<modId>/lang/<locale>.json`；支持冲突/缺失/未使用诊断、单独下载与可选 ZIP 打包，不修改控件 TextSpec。
- 可重复列表：Repeatable List 以外部数据决定行数、固定行高/间距/单列视口；Row Template 子节点复用普通控件编辑，支持 0/1/3/5/10/100 行模拟、裁剪、滚动、Undo/Redo 与刷新恢复。模拟行数不进入 JSON；Design PNG 固定 3 行代表性预览，导出合同明确 Java 数据/记录身份/命中/焦点/复用接入点。
- 可编辑 Row Template：选中 Repeatable List 后可进入独立模板编辑视图，画布只显示一份模板与可编辑边界；可添加合法控件、拖动/Resize、Inspector 编辑、复制、删除、调整绘制顺序，并通过 Undo/Redo 与 IndexedDB 恢复。模板编辑状态不进入 JSON/F2；导出标记 templateOnly，禁止把模拟行展开成固定控件。
- 原生文字能力诊断：Inspector 与导出 Manifest/Spec 标注 Button/CycleButton/StringWidget/Checkbox/EditBox/MultiLine/Slider/FittingMultiLine 的文字颜色与阴影可达性，区分公开 API、恒开阴影、固定色和只能替换控件的差异；不自动修改旧控件样式。
- Button/CycleButton 颜色模式：可选择「使用原生颜色样式」或「NeoForge 文字颜色 API」；只有后者显示 ARGB/取色器并导出 `setFGColor`，前者按原生白/浅灰渲染。旧项目缺省字段保持原颜色。
- 本地副本管理：保存 Popover 支持立即保存、打开副本、删除副本与清除缓存；删除当前副本会打开最近副本或新建空白项目，清除缓存只清本机副本，不影响已导出的 JSON/ZIP。
- 实现备注：Screen 与任意控件（含容器、Repeatable List、Row Template 节点）可填写可选实现备注，默认折叠、支持多行中文/英文/换行/特殊字符、Undo/Redo 与刷新恢复。备注作为低优先级设计说明进入 Agent Specification，不执行、不解析成 F2，也不改变画布或游戏初始状态。
- 控件树锁定：树行支持锁定/解锁；锁定节点及其后代不可选中或编辑，子控件不能单独解锁，只有最上层锁定节点可解锁。锁定是编辑器会话状态，不进入项目 JSON/Undo/导出。
- 滚轮缩放：Repeatable List 在隐藏、非活动 Page、仅轮廓或 Solo 排除时不拦截滚轮，画布可正常缩放；正常可见列表仍优先滚动自身。
- Page 树过滤：可选择在结构树中隐藏非当前 Page 的内容及子树，但保留 CreativeTab 切换控件与 Persistent 节点；仅影响树显示。
- CreativeTab 内容归属：同组其他标签已保存的内容默认不在当前候选列表显示，切回持有它的标签才显示；旧共享内容仍可取消。
- CreativeTab 标签内容：Inspector 显示已选内容数量，可折叠已选项，只保留未选标签作为候选；折叠仅影响会话显示，不修改关联或项目 JSON。
- 嵌入式 Image：Image / Sprite 可上传 PNG 并存入项目 JSON，画布与导出不依赖客户端 JAR；嵌入式贴图可加入 Static Bake，并支持设计级 Tooltip。
- Page 图片导出：单 Page Group 默认每个 Page 生成设计/放大参考图，初始 Page 保留 canonical 文件名；多 Page Group 默认当前组合，可导出全部组合（上限 100）。Page 图不创建新 Screen。
- 结构树折叠：有子节点的根、容器与 Repeatable List 可用 ▾/▸ 折叠子树；仅影响编辑显示，不进入项目 JSON、画布、可见性或 Undo，刷新后恢复展开，选中深层节点自动展开祖先。
- 个人模板库：顶部「模板」保存当前控件/容器及其子树为独立 Detached Copy 模板，插入时重生成 ID、重映射父子关系并单事务 Undo；模板保存在独立 IndexedDB，可重命名/删除/导入/导出，项目 JSON 不写入模板元数据。
- 组合兼容：visual_only Single Slot 可作为 Row Template 重复装饰；cycle-button 进入 Row Template；fill/image/status/progress/cycle 进入 Scrollable/Collapsible。inventory/ghost Slot、Native Region、Tree View 与更深容器嵌套仍受限并给出具体原因。
- Native Single Slot：Native Regions 新增 18×18 单槽位，可选 inventory（真实 Menu Slot）、ghost_selection（非消耗材料选择/标记）或 visual_only（静态外观）；固定内容 +1/+1 16×16，支持稳定 ID、别名、实现备注、Page 归属与设计态占位物品。Row Template 明确拒绝单槽；Ghost 不自动承诺 JEI/REI，不生成 Menu/网络/服务端逻辑。
- Rectangle 纯色四边：plain 模式可分别设置上/右/下/左颜色与宽度，默认填充色/1px，宽度只向内增长；支持恢复默认与越界拒绝。原版 GuiGraphics 只有 fill 与单色 1px renderOutline，无 per-edge API；Spec 明确提示需四次 fill 自绘，像素级稳定推荐 Static Bake。
- 有限行为编排：针对已支持的事件和动作，配置强类型比较、if/else、Switch 分支、AND/OR/NOT、共享状态映射、同 Screen 控件运行值读取与声明式互斥可见性映射（一个选项显示一个目标、自动隐藏其余），并通过会话预览和日志检查执行结果。
- 编辑恢复：设计撤销重做、本机自动保存、Blockly 草稿保护及已保存规则的布局恢复；编辑器临时状态与游戏设计初值分开管理。

工作流程：**网页设计 → 权威 JSON → ZIP / 实现规格 → 开发者或 Codex 实现 → Minecraft 实测**。

## 演示

以下图片选自 [`docs/results`](docs/results)，展示代表性项目的设计与 Minecraft 游戏内效果。

### 编辑器工作区

![三 Screen 项目在 GUI Maker 中的多画布编辑视图（旧版工作区）](docs/results/web-design.png)

上图为早期多 Screen 设计示例；当前正式编辑器已采用 Hybrid 工作区，并提供独立的 Blockly 行为模式。

### Minecraft 游戏内效果

| Main Screen | Screen 1 |
| --- | --- |
| ![Main Screen 游戏内截图](docs/results/Main-Screen.png) | ![Screen 1 游戏内截图](docs/results/Sub-Screen.png) |

### 组件与联动示例

| 选择控件与状态指示器 | 滑块与进度条 |
| --- | --- |
| ![Radio Group、Dropdown 与状态指示器的游戏内示例](docs/results/Indicator2.png) | ![滑块数值与 Direct、Normalize 进度条的游戏内示例](docs/results/ProgressBar2.png) |

| 树形层级与节点选择 | 折叠面板中的滚动容器 |
| --- | --- |
| ![Tree View 展开分支并选中叶节点](docs/results/Leaf.png) | ![折叠面板内的表单控件与滚动容器](docs/results/Scrollable-in-CollaspiblePanel.png) |

截图为代表性项目演示；浏览器近似预览与不同游戏环境下的实际视觉效果可能存在差异。GUI Maker 输出设计和实现规格，不自动生成或运行游戏代码。

## 运行

需要 Node.js 24.17.0 和 npm 11.13.0：

```sh
npm ci
npm run dev
```

使用浏览器打开终端显示的地址。构建使用 `npm run build`；单元测试使用 `npm test`，浏览器测试使用 `npm run test:e2e`（需安装 Playwright 浏览器）。测试源码位于 `tests/`，其中 `tests/unit/` 为单元测试。测试报告仅保存在本地。

仓库包含用户提供的 `src/gui/panel_16x.png` 和对应元数据。该纹理由 Minecraft 发射器 GUI 纹理裁切拼接；使用或分发 Minecraft 相关素材时，请自行确认适用的权利和条件。旧版 32× Panel 素材不包含在仓库中；需要该兼容样式时，可在本地提供 `src/gui/panel_32x.png`。

设计默认保存在当前浏览器的本地存储中，建议导出 JSON 备份。

## 开发状态

当前为持续开发中的阶段性版本。类型检查、构建与定向自动化按变更范围执行；完整工程回归仍有待处理项，阶段性功能验收不代表所有测试已通过。

## 许可证

项目代码采用 [MIT 许可证](LICENSE)。该许可证不授予 Minecraft 或用户提供的其他第三方素材的权利。
