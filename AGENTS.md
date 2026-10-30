# Minecraft GUI Maker 项目约束

F2 已由用户单独授权：Schema 0.8.0 的单 Screen 有序动作和引用删除保护以 `docs/architecture/F2_ORDERED_BEHAVIOR_CONTRACT.md` 为准；旧规则保留原格式。F0/F1 文档中的组件删除自动级联策略为历史，不再适用。F2 不授权 Blockly、脚本、游戏代码生成或完整多 Screen。

F1 已由用户单独授权：Schema 0.7.0 的 Rectangle 点击和声明式目标 Screen 规则以 `docs/architecture/F1_NAVIGATION_CONTRACT.md` 为准；不授权完整多 Screen 编辑器、Blockly、游戏代码生成或网络逻辑。

F0 已由用户单独授权：Schema 0.6.0 允许 `docs/architecture/F0_BEHAVIOR_CONTRACT.md` 所述的有限规则，旧版文档仍要求 behaviors 为空；下文关于全部 behaviors 必须为空的阶段叙述为历史。variables、assets 和节点 events 仍为空。F0 不授权 Blockly、脚本、服务器逻辑或完整行为系统。

当前状态请先阅读 `CODEX_HANDOFF.md` 和 `docs/PROJECT_STATUS.md`。以下阶段叙述包含历史时点：后续用户已单独授权并实施有限资源解析、纹理预览、轻量字体及 H1 的 Checkbox/CycleButton；历史上“仅授权 D”“E～H 未开展”等不应误认为现状。新的工作仍须遵从用户当前授权，不因状态汇总自动扩展范围。

## 目标与当前阶段

本项目位于 `D:\Minecraft\AIStudio\workspace\Minecraft GUI Maker`。网站用于 Minecraft Java Edition **1.21.1 + NeoForge 21.1.244 + Java 21** 的 GUI 可视化规格设计：原生能力拖放、受限积木行为、设计 JSON、参考 PNG、实现 Prompt。

V1 **不生成可执行 Java GUI/Mod 源码**，不连接游戏、不替代服务端权限/同步实现。没有后端、数据库服务、账号系统。浏览器 IndexedDB 仅本地持久化，不属于数据库服务。

第一阶段审计及 A+B、C 已在各自声明的验证范围内收束，D 同快照导出以及后续有限资源预览和 H1 组件已根据用户单独授权实施。GUI Scale 游戏内视觉、跨输入法、物理 DPR、其他浏览器与环境收尾保持 OPEN；不得因路线图或历史授权自动执行后续阶段。

C已在声明的自动化与用户实测范围内收束；用户确认双标签页新增保护、关闭后刷新恢复及导入JSON保留工作进度。记录见 `docs/validation/C_VALIDATION.md` 和 `docs/validation/STAGE_STATUS.md`。这不关闭原有OPEN，也不自动授权D～H。

用户曾独立授权 D 并冻结 `docs/architecture/D_EXPORT_CONTRACT.md` 的同快照导出合同。后续资源和 H1 是分别授权的有限扩展，不代表行为、通用图片资产、完整资源包兼容、Java 生成器或其他组件自动获授权；不顺带重构 A+B+C，既有 OPEN 保留。

D 限定实现的历史证据见 `docs/validation/D_VALIDATION.md`；后续状态与最新验证见 `docs/PROJECT_STATUS.md`。只声明实际覆盖，游戏内视觉、物理 DPR、真实跨输入法及环境 OPEN 不因历史记录自动关闭。原始 project JSON 保持唯一权威，导出合同不因后续修改静默变更。

用户随后单独授权“可调整尺寸的九宫格风格 Panel，生成独立 PNG”：仅覆盖 `docs/architecture/PANEL_BACKGROUND_CONTRACT.md` 的设计区自绘底板、独立纹理与兼容合同。这不是授权完整E～H；图片导入、ZIP、原版资产复制、信标界面和新增游戏Widget仍不在本次范围内。

2026-10-28用户明确要求使用其放在`src/gui`的Panel素材并以方形PNG导出；其说明素材由原版发射器GUI纹理四角裁切拼接，四个4×4角已与本地1.21.1发射器纹理核对一致。它是用户制作的原版纹理衍生素材，不是原版自带Panel文件或Widget；32×按用户选择作为16×16逻辑纹理的双倍分辨率采样。合同见 `docs/architecture/SUPPLIED_PANEL_TEXTURE_CONTRACT.md`；`src/gui`和`dist`不得提交到公开仓库。此授权不自动扩展到其他游戏素材、ZIP、行为或新增组件。

用户随后反馈一次实机 GUI 与原版视觉一致，并授权编辑体验调整：新设计的底板选择只提供无底板与16×；旧32×和自绘数据仍须可读取、恢复及导出，不静默迁移。三个浮层支持点击外部关闭，设计区普通滚轮缩放并支持1～200逻辑像素网格；网格、缩放和弹层状态不进入领域文档。该次实机反馈的分辨率、GUI Scale和资源包矩阵未提供，不应外推为全部场景已验证；后续控件只按用户明确授权的范围实施。

用户随后单独授权用户自备资源的有限解析、Button/EditBox 纹理预览及参考 PNG 资源快照导出，并授权轻量字体与 Checkbox/CycleButton。PNG 使用组件初态、同一资源 generation，并在资源变化时取消生成；用户提供的 Panel 继续保留。完整字体 provider、Tooltip、其他组件和资源机制未因上述授权自动开放；游戏内视觉和已有安全 OPEN 持续有效。

## 必读文档

- `docs/architecture/TECH_STACK.md`：候选技术决策和边界。
- `docs/research/M3E_CANVAS_REVIEW.md`：固定参考提交及不直接复用源码的结论。
- `docs/minecraft/GUI_COMPONENT_AUDIT.md`：版本链、五类能力、源码定位、限制与未验证项。
- `docs/architecture/GUI_SCHEMA_PROPOSAL.md`：独立 Schema 提案；实际验证器只实现AB_SCHEMA_PROFILE规定的子集。
- `docs/ROADMAP.md`：推荐任务、模块依赖与验收。
- `docs/architecture/AB_SCHEMA_PROFILE.md`：实际实现的 A+B 子集，events/behaviors/variables/assets 必须为空。
- `README.md`、`docs/validation/AB_VALIDATION.md`：运行方式、实测结果、环境问题与 OPEN 项。
- `docs/architecture/LOCAL_PERSISTENCE_DESIGN.md`：C的本地数据库、事务、恢复、并发及故障边界。
- `docs/architecture/D_EXPORT_CONTRACT.md`：D冻结的快照、输入提交、文件格式、坐标与证据分层合同。
- `docs/architecture/D_EXPORT_CONTRACT_0_1_1.md`：同快照增加放大参考图的合同修订；明确与0.1.0的差异。
- `docs/architecture/PANEL_BACKGROUND_CONTRACT.md`：Schema/导出0.2.0自绘Panel及兼容规则。
- `docs/architecture/SUPPLIED_PANEL_TEXTURE_CONTRACT.md`：用户素材、九宫格和方形图0.3.0修订及溯源限制。

## Minecraft / NeoForge 证据规则

1. 首先读 `D:\Minecraft\AIStudio\skills\minecraft-neoforge-dev\api_references` 对应映射源码；概念参考同目录下 `docs`（本地 NeoForge 开发文档）。签名/渲染顺序冲突以锁定源码为准。
2. 本次审计核对到 21.1.244，仅覆盖文档列明的文件。新增类型必须继续定位类、构造入口、属性、回调、尺寸与状态限制，并核对版本。不能把整个目录或记忆当作已确认 API。
3. 禁止网络搜索过时/版本不明的 Minecraft 或 NeoForge 代码。GitHub issue 问题报告可作为补充线索，必须注明版本与是否复现，不能代替源码证据。不得自动改用其他 Minecraft/NeoForge 版本。
4. 来源分类必须区分 `vanilla-widget`、`vanilla-draw`、`neoforge`、`screen-internal`、`custom`。抽象类、工厂入口、配套管理器、仅渲染函数不能假称可直接实例化 Widget。
5. 新增证据标记静态确认/文档说明/产品建议/未验证；没有源码环境时记录阻塞与缺口，不伪造确认结果。
6. 不把 Minecraft 反编译/映射源码、游戏 jar 或游戏资产复制进本项目或提交公开仓库。证据只记录定位、指纹及必要的简短 API 名称。用户资源需记录来源与可携带权利说明。

## 实施边界

- 领域文档不得依赖 React、Konva、Blockly 内部结构。UI 与画布/积木均为适配层；JSON 是权威内容。
- 目标技术推荐 React/TS/Vite、Konva、Zustand、Zod、IndexedDB、Vitest/Playwright。这是审计决策，依赖准确版本尚待第一项实现任务锁定；Blockly 后置。参考项目版本不是可直接采用的锁定依据。
- 逻辑坐标使用 GUI px 整数；编辑器 pan/zoom/DPR、选择、hover、focus 和积木布局不进入权威规格。不得把浏览器近似预览声称为游戏像素级渲染。
- 行为是受限声明性 AST，禁止 eval、任意 JS/Java 脚本和把 Blockly JS generator 作为执行引擎。预览使用独立副本，不修改设计初值。
- 导入必须先验证再原子替换；非法或未来格式不能静默删字段或降级。原生 source 由本地受信组件目录验证，不能信任外部声明。
- 一次拖拽/积木事务只产生一次领域历史记录。保存失败保留 dirty 状态。JSON/PNG/Prompt 从同一 revision 导出，保留缺失资源及待实现逻辑诊断。
- 不移植 m3e-canvas 整仓、Material 组件或 AI 连接能力。未来若授权复制实质源码，记录固定 commit、文件和许可证，保留要求的版权及 NOTICE。
- 只建立当前任务所需模块，不先建插件总线、协同编辑、云同步、通用脚本引擎或 Java 生成管线。

## 验证与交付

文档阶段检查文件、相对链接、版本一致性、证据定位和样例 JSON，明确未做运行测试。开发阶段按影响执行 typecheck/build、Vitest 领域/校验/几何/历史测试，以及 Playwright 真实输入、导入导出、存储与 PNG 测试。不写只重复实现的机械测试，不以截图测试证明 Java 行为。

只有后续任务实际修改 Java/Gradle/游戏资源时，才按对应 NeoForge 工作流构建并进行游戏内验证；本网站文档阶段不为满足 Mod 技能流程无关地运行 gradle/runClient。所有完成报告区分已验证事实、未验证事项与建议，列明修改文件及真实验证结果。未经用户要求不提交、推送或部署。

用户的全局目录约定继续有效：不在项目内散装技能、插件或 MCP。独立技能放用户 `.codex\skills`；新增本地 MCP 放 `D:\AI\Codex\mcp`；本项目内部只保存自身源码、文档与授权的工作文件。
