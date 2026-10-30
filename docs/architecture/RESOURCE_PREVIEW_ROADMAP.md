# 原生 GUI 资源预览：实施路线提案

状态：**仅设计，未授权实施**。目标和证据分别见 [资源审计](../minecraft/GUI_RESOURCE_AUDIT.md)、[组件视觉合同](../minecraft/COMPONENT_RENDER_MAP.md)、[导入及解析合同](RESOURCE_PACK_DESIGN.md)。每一步均以资源会话独立于 GUI 文档为前提，不顺带开发行为、Java 生成或新组件。

| 顺序 | 最小工作及依赖 | 验收与风险 |
|---|---|---|
| 1 | 单独固定资源合同、明确本地用户素材授权及替换当前静态 Panel import 的迁移方案；提供资源缺失时明确占位，不静默改变旧 JSON。依赖用户批准对现有体验的影响 | 构建产物扫描确认不含游戏 PNG/字体和不自动上传/持久化；旧项目可读取、来源/导出缺失明确提示。旧静态素材当前可能内嵌，不能宣称已经符合无分发目标 |
| 2 | 使用合成文件夹/ZIP fixture 实现只读、有界导入、根识别、format 34、会话原子替换；JAR 与不可信资源目录走单独身份与能力分支；仅用户选择 | 单元测试路径穿越、重名、软链接、CRC、压缩炸弹、数量与字节上限、格式范围、取消、失败保留旧会话；验证真实客户端 JAR 在预算内、浏览器能力和内存，不能扫描整个安装目录 |
| 3 | 实现资源堆栈、filter、跨层元数据、overlay 及 provenance；定义栈与普通文件分开处理；先仅可证明的 atlas sources | 多层 PNG/metadata 分离、metadata filter、上层图片不继承低层元数据、stack 顺序、overlay 和 NeoForge 条件化输入；未支持 source 必须明确 unsupported。避免把不完整模拟标为准确 |
| 4 | 使用用户资源及 per-sprite metadata 在预览中绘制 Button 和 EditBox 的各状态；stretch/tile/nine_slice 用经审计的算术；纯色矩形仍代码画 | 合成纹理黄金像素覆盖图角、不同边框、小尺寸、裁切、分数 zoom/pan、DPR1/2、普通/GUI Scale，重测已有接缝 PENDING 和大设计区；性能包括缓存失效、内存上限。样本不能提交游戏素材 |
| 5 | 独立字体解析实验：provider 栈、引用/条件、glyph 数据与文字布局；先明确有限子集及 unsupported | 合成字形和度量测试，实际由用户自备资源与游戏对照；Unicode、RTL、shadow、缺失字形、输入光标和选择等未覆盖时显示近似。字体运行时资源可能不全；不能将浏览器 monospace 称游戏字体 |
| 6 | 在已授权范围内评估 Tooltip 的代码渐变、布局与事件限制 | 渲染 1.21.1 的代码颜色/渐变及文字布局；位置、宽度、单/多行和 NeoForge 干预单测。不要使用 1.21.2+ 的 tooltip sprite；本步骤不代表新增 Tooltip 组件已授权 |

## 共同测试矩阵与停止条件

- 每阶段各自执行 typecheck、build、现有 Vitest 与受影响 Playwright；合成资产 fixture 必须包含可识别角落、非对称边框、透明与动画，不能携带 Minecraft 原图。实际用户授权素材的核对只记录摘要、尺寸及像素结论，不复制或发布素材。
- ZIP/目录与有效、无效、兼容范围/overlay；源高低层组合、丢失与 filter、namespace、atlas source 重名/移除、仅元数据覆盖、默认 stretch、tile、非对称 nine_slice、动画及不支持特性；本地 JAR 缺根 `pack.mcmeta` 单独验证。
- Button 的普通/悬停/聚焦/禁用与 EditBox 的边框、焦点、editable、value/hint、光标及选择；文本与视觉需结合字形和语言，不能只检查 sprite 是否加载。
- 游戏内参照需要锁定资源栈、语言、窗口、GUI Scale、DPR、系统、版本及对照步骤。网页与游戏采样/字体/渲染管线不同，未做逐项实测之前标记 OPEN；跨浏览器、物理 DPI、性能和大资源限制也分别报告。
- 无法支持某资源、atlas 或字体机制时，保留可操作设计并显示诊断，不静默切换为所谓原版效果；任何导入失败不改变项目、历史、既有资源会话或本地保存。授权及实现前，预算和安全方案仍需实验验证。

推荐第一项：经另行授权，先实现**使用合成 fixture 的资源解析核心与安全输入实验**，并确定现有内嵌派生 Panel 的无素材兼容策略；这一项不要求立即上线完整导入器或完成字体还原。
