# m3e-canvas 源码审计

审计日期：2026-10-27。仓库：[lnkiai/m3e-canvas](https://github.com/lnkiai/m3e-canvas)。审计固定提交：`49378e1e35f5de6aaadfcd3f852eeb0edffdbb95`。只读副本位于 `D:\Minecraft\AIStudio\work\m3e-canvas-audit-20261027`，未复制到本项目，未安装或运行其依赖。以下结论来自该提交源码静态检查，不代表在线演示的运行结果。

## 实际架构

| 方面 | 已查证事实 | 固定提交证据 |
|---|---|---|
| 应用壳 | Next.js App Router，静态导出；React 客户端动态加载 Editor，关闭该组件 SSR | [next.config.ts](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/next.config.ts#L6)、[app/page.tsx](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/app/page.tsx#L8) |
| 依赖 | package.json 声明 Next 16.4.2、React 19.3.0、motion、html-to-image、Tailwind、TS、Vitest；未声明 Konva/Zustand/Zod/Blockly/Playwright | [package.json](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/package.json#L19)；只是声明值，未验证 registry 可安装性 |
| 画布 | DOM 元素、CSS translate/scale、React pointer handlers；M3Node 绘制 Material 组件 | [Editor.tsx:4205](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/app/Editor.tsx#L4205)、[M3Node.tsx](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/components/M3Node.tsx) |
| 状态/历史 | Editor 内 React state/ref/callback；past/future 快照；同一字段 800ms 合并撤销 | [Editor.tsx:616](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/app/Editor.tsx#L616) |
| 本地保存 | localStorage；Web Locks 做标签页编辑权保护，有不支持时的降级；未见 IndexedDB 实现 | [Editor.tsx:689](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/app/Editor.tsx#L689)、[Editor.tsx:763](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/app/Editor.tsx#L763) |
| 文档模型 | lib/tokens.ts 混合 Item/Frame/Group/Doc、尺寸计算、主题常量及 React CSSProperties 类型依赖 | [tokens.ts:1626](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/lib/tokens.ts#L1626)、[tokens.ts:2349](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/lib/tokens.ts#L2349) |
| JSON | 直接保存 Doc，手写 isProject shape guards，Blob 下载和 File 读取；迁移在编辑器恢复路径处理 | [project.ts](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/lib/project.ts#L1) |
| PNG | html-to-image 的 toPng 对 frame DOM 截图，pixelRatio=2 | [Editor.tsx:3131](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/app/Editor.tsx#L3131) |
| Prompt | buildPrompt 读取 Doc、测量宽度与语言；effectivePrompt 允许人工替代文本 | [prompt.ts:1769](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/lib/prompt.ts#L1769)、[prompt.ts:1889](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/lib/prompt.ts#L1889) |
| 分享 | 文档去部分图片/历史后，通过 URL fragment 存放 JSON 或 deflate-raw + base64url | [share.ts](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/lib/share.ts#L1) |
| AI | 可选浏览器直连模型提供方，浏览器本地保存设置；与离线 Prompt 导出是不同能力 | [ai.ts](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/lib/ai.ts#L1) |
| 验证 | Vitest 测试包含 project、prompt、tidy、tokens、preview 等；未在审计中运行 | [project.test.ts](https://github.com/lnkiai/m3e-canvas/blob/49378e1e35f5de6aaadfcd3f852eeb0edffdbb95/lib/project.test.ts#L1)、package.json scripts |

Editor.tsx 在该提交有 4,992 行，许多手势、历史、存储、预览、导出操作集中在其中。组件目录的存在不等于具有可单独接入的编辑器 SDK；未发现独立发布、与 Material Doc 无关的通用编辑器包。

## 独立移植价值

| 模块/模式 | 可独立程度 | 建议 |
|---|---|---|
| project.ts 的文件名清洗、Blob 下载、错误返回 | 较小，但 isProject 与 Doc/KIND_ORDER/VARIANTS 相连，浏览器 IO 与校验混合 | 借鉴边界，重新实现本项目的 Zod 校验和 IO；现在不复制 |
| share.ts 的压缩 fragment 算法 | 压缩/编码部分可拆，但依赖 isProject 和 Doc，过滤规则会改变项目 | V1 不做链接分享；将来需大小上限和解压上限，不能当作完整项目备份 |
| SizeHandles.tsx | 有 box/z/onDown 接口，但依赖 React、motion、Palette、tokens、i18n | 借鉴缩放时固定手柄视觉尺寸、键盘 nudge；Konva 版本重新实现 |
| tidy.ts | 纯计算占比高，但依赖 M3 顶栏、底栏、rail、group 测量与 token 规则 | 不移植；Minecraft 的逻辑像素与自然尺寸规则不同 |
| prompt.ts | 确定性规格转文本的思路值得采用，具体实现依赖大量 M3 类型、主题、语言与行为 | 重写 Minecraft Prompt exporter，以本项目 Schema 与组件证据为输入 |
| Editor 历史/存储 | 撤销合并和单次拖拽事务可借鉴；与闭包、ref、UI 状态耦合 | 在本项目 store 中实现小型快照历史，不搬运整个 Editor |
| M3Node/Preview/tokens/theme/shapes | Material 视觉与行为体系，域耦合强 | 不移植，不把 Material radio/select/switch 误当 Minecraft 原生 |

结论：本阶段**不复用源码**。没有发现足以抵消适配成本的现成独立编辑器核心；复用产品交互与导出思想更合适。也不因参考项目有 AI、手机适配、分享、主题系统就把这些加入 V1。

## 许可及不确定性

主仓库 LICENSE 为 MIT、版权 2026 lnkiai；复制实质源码应保留版权与许可。NOTICE 单独声明 material-components-android、m3-loading-indicator 的 Apache-2.0 移植及 Google Material 图形数据来源，不能认为所有附带资产只需 MIT。Minecraft 资产另有权利边界，与该仓库许可无关。

未验证：实际浏览器拖拽性能、构建安装、测试通过情况、长文档/损坏文档稳定性、依赖供应状态；不据此宣称可生产直接使用。未来若决定复制某函数，先记录文件、固定 commit、许可证及改动，不整仓迁入。
