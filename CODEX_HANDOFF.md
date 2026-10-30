# Minecraft GUI Maker：Codex 项目交接

> F2 有序动作与节点引用保护见 [F2 合同](docs/architecture/F2_ORDERED_BEHAVIOR_CONTRACT.md)；旧规则不迁移，Blockly 和完整 GUI 组仍未实施。

> F1 新状态与用户报告的 F0 ZIP → Agent → 游戏实机验证见 [F1 合同](docs/architecture/F1_NAVIGATION_CONTRACT.md) 和 [F0 验证](docs/validation/F0_VALIDATION.md)。F1 目标仅为声明，完整多 Screen 仍未实施。

> F0 和名称修订：现行规则及无批次码文件名见 [F0 合同](docs/architecture/F0_BEHAVIOR_CONTRACT.md)；下文 F 未实现、带批次码命名等为历史。F0 不授权 Blockly 或完整行为系统。

> D-Export 更新：批次命名及可选 ZIP 现按 [0.3.1 合同](docs/architecture/D_EXPORT_NAMING_ZIP_CONTRACT.md) 执行；下文关于固定批次前缀和没有 ZIP 的说明为历史。

> 2026-10-29 D-Shadow 更新：下文关于阴影未编码、网页无阴影及推荐先设计阴影的叙述属于实施前历史。现行合同见 [D-Shadow 合同](docs/architecture/D_SHADOW_CONTRACT.md)，验证见 [D-Shadow 验证](docs/validation/D_SHADOW_VALIDATION.md)。

更新：2026-10-29，Asia/Shanghai。项目根目录 `D:\Minecraft\AIStudio\workspace\Minecraft GUI Maker`。本文件由当前源码、历史记录及用户对话整理；历史测试、实机反馈与推测分别标注，不是新功能授权。**本次交接不包含待继续执行的开发任务；等待用户给出下一项任务。**

## 先读什么

1. [AGENTS.md](AGENTS.md)：项目范围、源码证据、禁止事项和用户工作区约定；其中较早的阶段叙述是历史，不可把“仅授权 D”当成当前代码状态。
2. [项目状态与推荐顺序](docs/PROJECT_STATUS.md)：能力、路线阶段和 OPEN；[原路线](docs/ROADMAP.md) 是历史方案，不是当前授权清单。
3. 根据具体任务阅读 [Schema 提案](docs/architecture/GUI_SCHEMA_PROPOSAL.md)、[A+B 实际子集](docs/architecture/AB_SCHEMA_PROFILE.md)、[H1 合同](docs/architecture/H1_COMPONENT_CONTRACT.md)、[本地保存](docs/architecture/LOCAL_PERSISTENCE_DESIGN.md)、[D 导出合同](docs/architecture/D_EXPORT_CONTRACT.md)、[Panel 合同](docs/architecture/SUPPLIED_PANEL_TEXTURE_CONTRACT.md) 以及实际源码。旧文档的阶段状态可能过时；以当前代码、用户较新指令和本交接的证据范围为准。
4. Minecraft / NeoForge 查证优先使用 `D:\Minecraft\AIStudio\skills\minecraft-neoforge-dev\api_references` 和该目录下 `docs`。目标 Minecraft Java **1.21.1**、NeoForge **21.1.244**、Java **21**、资源包格式 **34**。禁止用网络上版本不明代码替代目标版本证据。见 [GUI 组件审计](docs/minecraft/GUI_COMPONENT_AUDIT.md)、[H1 源码审计](docs/minecraft/H1_COMPONENT_SOURCE_AUDIT.md)、[资源审计](docs/minecraft/GUI_RESOURCE_AUDIT.md)、[阴影审计](docs/minecraft/TEXT_SHADOW_AUDIT.md)。

## 产品定位和授权边界

浏览器 GUI **规格设计器**：用户设计界面并导出权威 JSON、参考 PNG 和开发者/AI Agent 实现材料。V1 不产生可运行 Java GUI/Mod，没有后端、账号或云数据库。未来行为描述必须是受限、可序列化的领域模型；不得执行任意 Java/JS，Blockly 不应成为权威格式。

用户曾单独授权并完成 A+B、C、D，以及有限资源输入/预览、Panel、轻量字体和 H1 两个控件。用户已报告 H1 在网页及游戏内测试，也报告一次 Panel 实机效果符合预期；这些是特定设计的反馈，不构成全部状态、资源包、GUI Scale 和设备上的像素一致结论。F 行为系统、G Blockly、额外组件、通用图片资产、项目 ZIP 导出、完整字体 provider、Java 生成器及资源迁移**没有因路线图自动获授权**。保留现有用户提供 Panel；公开发布、素材清理和迁移必须另行决定。

本地项目当前没有 Git 元数据：2026-10-29 在项目目录执行 `git status --short` 返回 `not a git repository`。不能给出 commit 基线或声称工作区干净；不要初始化、提交、推送或部署，除非用户要求。不要清理用户文件、浏览器 IndexedDB、`docs/temp` 字体/日志或既有报告。

## 实现全景与代码地图

| 层 | 文件 | 实际职责与注意点 |
|---|---|---|
| 入口与页面 | `src/main.tsx`、`src/App.tsx`、`src/styles.css`、`src/ui/*` | 启动本地会话；页面组装六类组件库、属性、画布、资源/字体、本地保存、导出、GUI Scale；侧栏和浮层只影响视图。资源菜单与空选中控制位于 Inspector。`ResourceTestPanel` 的 Sprite 查询下拉目前只列五个旧 Button/EditBox ID，Checkbox 的四个 ID 在解析器和画布中另行支持。 |
| 领域与严格校验 | `src/domain/catalog.ts`、`model.ts`、`schema.ts` | 目标与类名白名单、六个节点、默认值与 Zod 严格校验。模型不依赖 React/Konva/Blockly。单 Screen、整数 `gui-px`、固定来源、全局 ID 唯一，节点最多 1000；JSON 5 MiB、嵌套 32 层限制。`events`、`behaviors`、`variables`、`assets` 目前必须为空；未知组件/来源、悬空引用、未来版本拒绝。`TextSpec` 的 `translate.fallback` 是网页参考文字，不是游戏翻译结果。 |
| Screen/Panel | `src/domain/guiScale.ts`、`panel.ts`、`src/ui/ScreenSettings.tsx` | 初始 320×180 是产品默认，不是游戏限制。编辑器尺寸 UI 1～8192；GUI Scale 是基于帧缓冲的只读近似，与编辑器 Zoom/DPR 分开。Panel 至少 8×8；独立纹理导出根据较长边取 512/768/1024 方形，超过 1024 拒绝整批 Panel 导出而保留 JSON。 |
| 编辑与历史 | `src/editor/store.ts` | Zustand vanilla 的 `doc/selected/past/future/gesture`。每次普通编辑或导入先完整校验再提交；拖动草稿不入文档，完成一条历史，取消无历史。最多 100 项历史。导入是独立事务。领域 revision 随快照撤销/重做，**不是**严格递增的存储版本。 |
| 本地保存 | `src/io/repository.ts`、`localSession.ts`、`src/ui/LocalSavePanel.tsx` | IndexedDB `minecraft-gui-maker` v2，`projects` 和 `workspace`；350 ms 防抖、队列与事务 CAS，Web Locks 可用时先取单写锁；冲突冻结、失败保留 dirty、恢复原记录。导入建新本地副本，历史/选择/临时预览不存。存储按浏览器 origin 隔离；不要清除用户数据。 |
| 画布与交互 | `src/canvas/Canvas.tsx`、`InlineTextEditor.tsx` | Konva 的视觉变换与逻辑坐标隔离；左键拖动、右键平移、滚轮以指针为中心缩放、网格与 GUI Scale；单独交互预览使用 React 会话状态，Checkbox 聚焦与悬停区分，CycleButton 点击/Shift/滚轮循环，退出清除临时值。双击 Checkbox 编辑 message，CycleButton 编辑**初始选项**文字；翻译键保留。`src/canvas/cyclePreview.ts` 是独立测试过的辅助类，但当前 Canvas 直接实现自己的会话状态，并未使用该类；不能拿辅助类单测当作完整画布交互证明。 |
| 资源解析 | `src/resources/core.ts`、`layered.ts`、`src/ui/ResourceTestPanel.tsx` | 用户显式选择客户端 JAR 作为基础层，可另选一个 ZIP/目录覆盖包；JAR `version.json` 是自报，不证明来源。`pack_format` 可通过 `supported_formats` 覆盖 34。有限 `minecraft:gui` directory atlas、五个按钮/输入框 Sprite 和四个 Checkbox Sprite；上层图片不得错误继承下层 metadata。generation 防止过期异步结果；资源会话仅内存，不写设计 JSON/IndexedDB、不自动上传。未实现多覆盖层、filter/overlay/其他 atlas source/动画、完整字体解析。 |
| 渲染与字体 | `src/render/spritePreview.ts`、`panelTexture.ts`、`previewFont.ts`、`h1Layout.ts` | 解析出的 Sprite 按 stretch/tile/nine_slice 先合成逻辑像素栅格，缓存最多 128 项/32 MiB，资源切换清缓存；Canvas/PNG 复用 `spriteForNode`、`SpriteRasterCache` 和 `drawPreviewText`。字体用可选用户提供的 FontFace 或系统回退，导出等待并绑定字体代次。Checkbox 布局仅浏览器近似，方框 17×17，文字超 1024 UTF-16 单元的预览截断且保留原文；不能用浏览器测量冒充游戏自然尺寸。网页不绘制文字阴影。 |
| 导出 | `src/exports/draftBarrier.ts`、`snapshot.ts`、`visualSnapshot.ts`、`designPng.ts`、`bundle.ts`、`specification.ts`、`useExports.ts` | 先验证全部草稿再提交，捕获深冻结文档与 revision；资源、字体分别绑定代次，异步切换取消整批。PNG 为组件初态、不含选框/网格；1×设计图、放大参考图、权威 JSON、结构化规格、Prompt、manifest，Panel 启用时额外背景 PNG。设计图单轴上限 8192 / 总像素 16,777,216；产物逐个下载，**不是 ZIP 包**。规格区分源码事实、设计意图、未验证项；Prompt 不能替代权威 JSON。 |

## 版本和兼容合同

- `emptyProject()` 默认 Schema `0.1.0`，并非所有新文档一律 `0.4.0`；自绘 Panel 使用至少 `0.2.0`，用户纹理 Panel 使用至少 `0.3.0`，Checkbox/CycleButton 必须 `0.4.0`。首次加入 H1 节点与升级在同一历史事务内；删除节点、Panel 操作不应把 0.4.0 降级。旧版合法文件可读取，不静默迁移；旧版本号携带新节点严格拒绝。
- Checkbox 的 `bounds` 是设计参考边界，`maxWidth` 是独立构造参数，`bounds.h` 不作为原版构造高度。原版 Checkbox 的文字固定浅色；当前 Panel 预览改为深灰以便辨识，游戏端实现该外观需自定义绘制；无 Panel 预览用浅色。
- CycleButton 选项 ID 必须唯一、非空、与显示文本分开，初始 ID 必须存在；支持 `value-only` 和 `name-and-value`。Inspector 目前以 JSON 输入选项；默认旁白仍使用名称，翻译 fallback 不是游戏翻译。
- 新建 StringWidget 的颜色为 `#FF404040`；已有数据仍按已存颜色导入。阴影在 Schema 中未指定，游戏应采用原生默认；网页/PNG 无阴影，前次无阴影意图不能作为已编码合同。NeoForge `EditBox.setTextShadow` 与其他控件自定义绘制的能力必须区别。不要自行引入 shadow 字段或破坏旧版项目。

## 资源安全与资产边界

`src/resources/core.ts` 自实现 ZIP 索引/流式读取及 CRC，支持 stored/deflate，普通包最多 20,000 条、客户端 30,000 条；输入 128 MiB、每文件 16 MiB、累计 128 MiB、压缩比 200、JSON/mcmeta 2 MiB、PNG 单轴 8192 / 16,777,216 像素等为**产品预算而非游戏限制**。校验路径穿越、重复/大小写冲突及链接；客户端仅按需读取资产，受限支持带签名 32-bit data descriptor。ZIP64、分卷、加密和不支持机制不应被标为可用。索引/查询时 PNG 主要检查头部与 IHDR，Canvas/PNG 使用的 Sprite 才通过浏览器解码；这不等价于原生解压器内存上限或完整安全审计。

用户提供的 `src/gui/panel_16x.png`、`panel_32x.png` 与 `panel.png.mcmeta` 是由原版发射器 GUI 纹理四角裁切拼接的衍生素材，并非原版 Panel Widget/文件。已有源码通过固定摘要校验及导出此素材；`.gitignore` 忽略 `src/gui/` 和 `dist/`，构建 JS 可能内嵌其字节。项目 `docs/temp/` 另有用户本地字体和诊断材料，**不代表具有可分发许可**。不要将游戏素材、字体、JAR、反编译源码或用户资源发往公开仓库，也不要静默删除/替换用户 Panel；公开发布需单独审查资产和构建物。

## 测试和可复现状态

`package.json`/`package-lock.json` 固定 Node 24.17.0、npm 11.13.0、React 19.2.0、TypeScript 5.9.3、Vite 7.1.12、Konva 10.0.12、Zustand 5.0.8、Zod 4.1.12、Vitest 3.2.4、Playwright 1.56.1。2026-10-29 本次复核实际执行：

```powershell
Set-Location -LiteralPath 'D:\Minecraft\AIStudio\workspace\Minecraft GUI Maker'
node --version             # v24.17.0，退出 0
npm.cmd --version          # 11.13.0，退出 0
npm.cmd run typecheck      # 退出 0
npm.cmd run build          # 退出 0；JS chunk >500 kB 提示
npm.cmd test               # 100 通过，0 失败，退出 0
```

本次另外在同一产品代码版本运行外部 Vite 完整 Playwright：**166 通过、0 失败、0 跳过、0 flaky，退出 0**。Chrome 模拟 DPR 1/2、1440×1000，设置了 `GUI_CLIENT_JAR` 使用用户此前授权的本机客户端；原始结果 [handoff-2026-10-29-playwright.json](handoff-2026-10-29-playwright.json)。这是浏览器自动化结果，不是游戏内或物理 DPR 全面一致。之前的 `h1-text-final.json`、`shadow-user-flow.json` 属于不同历史代码版本，不与本次计数相加。

Windows 本工具环境默认 Playwright `webServer` 曾在用例显示完成后无法退出且无 JSON；用户自己的 PowerShell 单项正常退出。停止 5173 后仍在工具环境复现，根因 OPEN，详情 [退出诊断](docs/validation/H1_EXIT_DIAGNOSTIC.md)。已验证的替代方式：在项目目录一个终端手动启动 `npm.cmd run dev -- --port 4173 --strictPort`，另一个终端运行：

```powershell
$env:GUI_BROWSER_CHANNEL = 'chrome'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = 'next-playwright-result.json'
npx.cmd playwright test --config=playwright.manual.config.ts --reporter=json --trace=off --workers=2
```

按需由用户选择可用的本机 1.21.1 JAR 并设置 `GUI_CLIENT_JAR`；不设置时 `client-jar-local.spec.ts` 和 `font-resource-audit.spec.ts` 会跳过，必须报告实际跳过数。此命令默认两个 Chrome context 模拟 DPR 1/2、1440×1000，不等于物理 DPR 或多浏览器。运行完在启动 Vite 的终端用 Ctrl+C 停止自己启动的服务，不应停止用户其他服务。保留原始报告与进程退出码；截图、用户 JAR 和本地素材不应公开分发。

## 后续方向和停止条件

优先建议：① 与用户明确文字阴影的可配置语义、旧版本兼容及哪些情况需要自定义绘制；② 设计用户主动触发的一键同批 ZIP，继续保持文档/资源/字体同快照与权威 JSON；③ 在 Blockly 前冻结受限行为 AST 与安全边界；④ 根据需求逐个审计扩展组件/资源。以上是建议，**不是已批准任务**。原版游戏内视觉、字体和 Checkbox 尺寸、跨浏览器/物理 DPR、输入法、资源读取安全/解压内存、资产公开分发及默认测试收尾继续 OPEN。完成用户下一项授权任务后按其阶段门槛停止，不能宣布 GUI Maker V1 已完成。
