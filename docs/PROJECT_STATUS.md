# 项目现状与后续方向

> F2 单 Screen 有序动作原型见 [F2 合同](architecture/F2_ORDERED_BEHAVIOR_CONTRACT.md)；用户实际体验及游戏端实现仍待验证。

> 用户报告 F0 一次 ZIP → Codex 实现 → 游戏点击的端到端实机通过，范围见 [F0 验证](validation/F0_VALIDATION.md)。F1 Rectangle 点击与声明式导航见 [F1 合同](architecture/F1_NAVIGATION_CONTRACT.md)；目标 Screen 未有完整画布或运行时导航。

> F0 行为原型与无批次码文件名见 [F0 合同](architecture/F0_BEHAVIOR_CONTRACT.md)；下文 F 未实施及带批次码命名为历史，F1/G 仍未授权。

> D-Export 更新：名称和可选 ZIP 的现行规则见 [0.3.1 合同](architecture/D_EXPORT_NAMING_ZIP_CONTRACT.md)；下文没有 ZIP 的说明为历史。

> D-Shadow 已授权实施；下文阴影未编码的叙述保留为历史。现行规则见 [D-Shadow 合同](architecture/D_SHADOW_CONTRACT.md) 和 [验证记录](validation/D_SHADOW_VALIDATION.md)。

整理日期：2026-10-29。本文件汇总现有代码、历史验证记录与用户反馈；不是新功能授权，也不把历史记录中的测试数量相加。后续会话的代码路径、限制和可复现命令详见 [CODEX_HANDOFF.md](../CODEX_HANDOFF.md)。历史路线图及各批记录保留当时的范围和结果。

## 产品与已实现能力

- 目标为 Minecraft Java 1.21.1 / NeoForge 21.1.244 / Java 21。权威文件是 GUI 设计 JSON；网站输出参考图、规格与实现 Prompt，不生成可运行 Java Mod。
- A+B：单 Screen、整数 GUI 逻辑坐标、画布添加/选中/拖动/尺寸编辑、Inspector、撤销重做及严格原子导入；缩放、平移、网格与选择不进入权威文档。设计区可调整，GUI Scale 使用浏览器近似预览。
- C：IndexedDB 本地保存、刷新恢复、冲突保护与 JSON 备份；用户曾确认双标签页保护、刷新和导入保留进度。浏览器清理或存储损坏风险仍需依靠备份。
- D：同一已提交文档快照生成权威 JSON、设计区 PNG、放大参考图、结构化规格、Markdown Prompt 和 manifest；PNG 使用资源快照及组件初态。资源或字体变化期间的导出保护按各批验证范围成立。当前界面逐项下载文件，**没有一键导出 ZIP**。
- 组件：`Button`、`EditBox`、`StringWidget`、`Checkbox`、`CycleButton` 及 `GuiGraphics.fill` 矩形；矩形是绘制元素而非独立 Widget。H1 创建和合法 0.4.0 导入已开放；用户报告已在网页及游戏内测试。该反馈只覆盖其实际设计，不证明全部状态、资源组合和版本环境均一致。
- Checkbox 的 `bounds` 为设计参考边界，游戏构造由文字、游戏字体和 `maxWidth` 派生；Panel 上深灰文字是浏览器可读性处理，原版 Checkbox 固定浅色，游戏端匹配需自定义绘制。CycleButton 选项有稳定 ID，选项当前通过 Inspector 的 JSON 编辑；交互预览不实现游戏业务回调。
- Panel：新设计提供无底板及用户提供的 16× 发射器纹理衍生底板，旧 32×/自绘数据保留兼容；可导出设计区位于左上、其余透明的方形背景纹理。用户报告一次实机外观符合预期，不外推所有配置。现有 Panel 素材保留，其公开分发及授权问题未决，不能声称构建产物不含游戏纹理衍生内容。
- 用户自备资源：明确选择本机 1.21.1 客户端 JAR 和一个 ZIP/文件夹覆盖包，按会话解析有限 GUI sprite、来源和元数据；不自动扫描、上传或持久化资源字节。Button、EditBox、Checkbox 与 CycleButton 复用已支持资源路径；不是完整资源包、atlas、filter、overlay 或字体 provider 兼容实现。format 34 为目标；supported_formats 包含 34 的包可兼容，不等同要求其主 pack_format 必须为 34。
- 字体：采用可选用户字体和系统回退，画布/PNG 共享浏览器近似文字绘制；不实施原版 FontManager/provider。新建 StringWidget 默认 `#FF404040`，旧文档保留自己的颜色。阴影未在 Schema 中定义：原生默认带阴影，网页及参考 PNG 当前不绘制阴影；游戏实现不应从图片推断无阴影。详见 [阴影审计](minecraft/TEXT_SHADOW_AUDIT.md)。

## 对照原路线

| 原阶段 | 当前状态 | 尚缺或边界 |
|---|---|---|
| A+B | 声明的自动化范围内收束 | 多设备、真实输入法和游戏视觉并未普遍验证。 |
| C | 声明的自动化与用户反馈范围内收束 | 非云备份；多浏览器与极端故障仍 OPEN。 |
| D | 核心同快照导出已实现，用户曾开展 Agent/游戏实测 | 无一键 ZIP；PNG 与游戏字体、阴影及 Checkbox 外观仍有明确差异。 |
| E | **部分实现**：用户资源输入、有限双层解析与纹理预览已单独授权实施 | 原路线的通用用户图片引用、资源随项目往返及导出 ZIP 未实现；多覆盖包、filter、overlay、更多 atlas source 和动画未实现。资源包 ZIP 输入不等于项目 ZIP 导出。 |
| F | 未实现 | Schema 中 behaviors/variables 仍为空；无受限行为规格编辑或运行时行为。 |
| G | 未实现 | 尚未接入 Blockly；先依赖 F 的稳定领域语义。 |
| H | **部分实现**：Checkbox、CycleButton 已加入 | Slider、列表、容器等未加入；每个组件仍需锁定版本源码审计与用户独立授权。 |

## 验证证据及用户反馈

- 2026-10-29 文档整理时，当前 Node 24.17.0 / npm 11.13.0：`npm.cmd run typecheck`、`npm.cmd run build` 均退出 0，`npm.cmd test` 100 通过、0 失败、退出 0；构建有大于 500 kB 的 chunk 警告。使用外部 Vite、本机 Chrome、用户自备客户端 JAR 和模拟 DPR 1/2 的完整 Playwright 回归 **166 通过、0 失败、0 跳过、退出 0**，原始结果 [handoff-2026-10-29-playwright.json](../handoff-2026-10-29-playwright.json)。此结果不关闭游戏视觉、物理 DPR 或默认 webServer 收尾 OPEN。
- 用户已报告 H1 控件在网页和游戏内实际测试，并提供阴影、尺寸及导出说明反馈。未提供完整测试矩阵，不将其外推为所有状态通过。
- 2026-10-28 的历史完整回归 `h1-text-final.json` 在文字双击与可读性修改后、阴影说明前运行：Chrome 模拟 DPR 1/2，166 通过、0 失败、0 跳过、退出 0。
- 2026-10-28 阴影说明后当时仅运行受影响的 H1/导出 Playwright 专项：16 通过、退出 0，报告 `../shadow-user-flow.json`；随后于 2026-10-29 完成上文所述的当前代码完整回归。不能将不同代码版本的测试数量相加。
- H1 正常流程证据及 0.4.0 事务见 [H1 验证](validation/H1_USER_FLOW_VALIDATION.md)；该历史记录的“用户实测 PENDING”已由后续用户反馈部分更新，但其列出的未覆盖场景仍然有效。

## OPEN / PENDING

1. 游戏内 Checkbox 自然尺寸/换行、网页字体与文字阴影、GUI Scale、资源栈、语言及具体控件状态的系统化对照。用户一次实测不代表普遍像素一致。
2. 文字无阴影的设计意图不能存入权威 Schema；是否新增显式阴影属性及其版本策略仍待产品决定。EditBox 的 NeoForge `setTextShadow` 与其他控件需要自定义绘制的能力不同，不能统一宣称原生支持。
3. 原始资源读取器的独立安全审计、压缩/解码峰值内存、低内存设备与跨浏览器目录授权；不声称适用于任意不可信归档。
4. 真正物理 DPR、跨浏览器、输入法、默认 Playwright webServer 收尾异常及 Windows 1909 的环境差异；外部 Vite 配置可作为已验证的测试方式，不代表根因已解决。
5. 本地项目长期备份、一键打包和资源携带/分发策略。现有用户提供的 Panel 不擅自删除、替换或迁移；公开发布前须单独评估权利及构建产物。
6. 一般文字颜色目前是可编辑属性：深灰为新 StringWidget 默认，不会静默覆盖旧项目自定义颜色；是否让旧项目一键统一颜色属于待决定的产品操作。

## 建议的后续开发顺序（均需另行授权）

1. **先冻结文字视觉语义**：决定阴影使用原生默认、明确有/无阴影，或仅作为实现备注；如需要显式属性，先定义 0.4.0 旧文档兼容与升级、按控件标注原生/自定义实现方式，再实施画布与 PNG 一致性及导出验证。这直接回应现有实机反馈。
2. **改善同批交付**：设计主动触发的一键 ZIP，将权威 JSON、参考 PNG、Prompt、manifest 与可选 Panel 图作为同批文件，继续保持原始 JSON 权威、单快照与资源来源说明；明确体积限制、失败原子性和不自动上传。该项不必实现通用资源系统。
3. **行为规格先于 Blockly**：冻结有限事件/动作/变量及来源、验证和安全边界，先完成独立 AST、表单编辑与只读或隔离预览，再评估 Blockly 双向适配。游戏回调、网络与服务器逻辑仍是开发者责任。
4. **按需求扩展控件或资源**：每次限定单个组件/机制、锁定本地源码证据与实际测试；不自动扩展完整资源包兼容或引入原版字体系统。
5. **持续维护但不阻塞产品选择**：补足用户关心的视觉和平台实测；公开发布前再单独处理 Panel 素材权利、构建物、ZIP 安全审计和内存预算。

上述为推荐顺序，不意味着 F/G、ZIP、额外控件、Java 生成或资源迁移已被授权。GUI Maker 整体 V1 不应标记完成。
