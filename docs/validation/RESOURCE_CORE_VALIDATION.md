# 用户自备资源：第一批实验记录

2026-10-28。结论：**单层资源输入与最小查询核心的有限测试通过；安全性及可用性整体仍为 PENDING。** 这不是网站导入功能或完整 Minecraft 资源解析。运行代码没有接入编辑器、画布或构建入口。

## 实现及操作方式

`src/resources/core.ts` 是独立 TypeScript 模块：`prepareSession({kind:'zip', blob}, layer, signal)` 或 `prepareSession({kind:'directory', files:[{path,file}]}, layer, signal)` 建立单包只读索引；`directoryFiles(Array.from(input.files))` 接收用户自行选择的 `webkitdirectory` 文件列表；`ResourceSessionManager.replace` 成功后原子替换、失败/取消保留旧会话，新请求取消旧请求；`query('assets/namespace/path')` 返回 valid/missing/invalid/unsupported 与层、路径、字节数，`read` 按需返回副本，`close` 中止读取并清理引用。当前没有正式 UI，以上为供独立实验调用的接口；不上传、不写 IndexedDB、无对象 URL。

单层支持根级 `pack.mcmeta`、format 34 与 supported_formats，拒绝 filter/overlay；仅索引路径文件，不解析 sprite、字体或跨层覆盖。输入必须直接指向根，不自动去除 ZIP 外层目录。文件夹适配器只使用用户选择的 FileList，不扫描安装目录。客户端 JAR 与普通包不混用；本批没有 JAR 入口或实测，标记 unsupported。

ZIP 使用自实现结构检查、CRC32 和浏览器 `DecompressionStream('deflate-raw')` 流式解压，未新增依赖和 lockfile 变化。仅支持 ZIP 32 位、stored/deflate，无加密、分卷、ZIP64 或 data descriptor；不支持时显式拒绝。目录 ZIP64、其他编码和平台细节不宣称兼容。实际浏览器不支持 deflate-raw 时返回 unsupported。此实现尚无独立安全审计，不等价于经过安全审查的 ZIP 库。

## 安全策略及实验范围

实现阈值（产品策略，不是游戏限制）：ZIP 输入 128 MiB，中央目录 16 MiB，最多 20,000 条目，单文件 16 MiB，累计 128 MiB，压缩比 200:1，JSON/mcmeta 2 MiB，路径最大 1024 字符/64 段，PNG IHDR 单轴 8192/总像素 16,777,216。比设计提案收紧以减少资源消耗；这些数字**尚未在实际客户端 JAR、多个浏览器或极限机器上验证，不能视为经过容量论证的最终值**。

检查路径穿越、文件重名和大小写冲突、文件/目录冲突、符号链接、头部越界/重叠、CRC 和大小。ZIP 中央目录大小只作预筛；解压时逐块计数并核对声明、CRC 和上限，读取过大立即取消流。PNG 只检查 signature/IHDR 和尺寸预算，**不解码、不核验 PNG 内部完整性、IHDR CRC 或真实解码内存**；`valid` 指索引与本批传输检查成功，绝不表示图片或任意资源语义正确。其他 JSON 除 pack.mcmeta 外只限大小，不解析内容。恶意 native 解压器在返回 chunk 前的内部内存上限、墙钟时间和 worker 隔离尚未验证；不能将此版用于可信安全边界而不做进一步安全审查。

合成 fixture 由 `tests/resource-fixtures.ts` 运行时生成 ZIP/文本，使用 Node 自带 deflate，不含游戏素材；浏览器测试另生成随机2 MiB字节。Vitest 检查损坏 CRC、伪造解压长度、1 MiB高压缩率条目、超 16 MiB目录文件、超 2 MiB JSON、超限 PNG 尺寸、非法路径、重复、symlink、格式和原子失败/预取消等。Chrome 实际读取 2,097,152 字节随机 deflate 内容，并拒绝同一数据伪造为 1024 字节的声明；含成功读取及失败检查两次流程约 276 ms，非性能保证，也未测峰值内存。测试覆盖的是样本而非所有畸形 ZIP 或所有预算边界。

Chrome 的 `webkitdirectory` 测试通过 Playwright `setInputFiles` 选择临时原创文件夹，验证 FileList 的相对路径和读取；另有延迟流中途取消测试。**未打开操作系统文件选择器，未验证用户授权弹窗、权限撤销、目录符号链接行为、其他浏览器或真实大文件内存。**

## 结果

Node 24.17.0、npm 11.13.0、Windows、Chrome 156.0.8078.48、Playwright 1.56.1；浏览器 viewport 1440×1000，模拟 DPR 1/2。

- `npm.cmd run typecheck`、`npm.cmd run build` 成功；Vite 提示既有大于500 kB chunk。
- `npm.cmd test`：82/82，其中新资源测试16项、既有66项。
- `$env:GUI_BROWSER_CHANNEL='chrome'; npx.cmd playwright test tests/resource-core.spec.ts tests/editor.spec.ts tests/persistence.spec.ts --trace off`：44/44；随后增加资源目录及大样本专项，`npx.cmd playwright test tests/resource-core.spec.ts --trace off`：6/6，[原始结果](resource-core-results.json)。44项回归早于最后一次核心的路径前缀冲突保护；最终核心另经过全部 Vitest 与资源浏览器专项复测，未重新运行那42项既有浏览器用例。
- 初次新增测试因 Vitest 数据参数展开与 TS 类型标注不正确失败，修正测试后通过；不将初次失败当成安全实现证据。
- dist 的3个文件经扫描，已有 `panel_16x.png` 与 `panel_32x.png` 原始字节未单独存在，但 Base64 均存在于 JS；`deflate-raw` 模块标记未在 dist 中发现，与模块未接入构建一致。这是针对两张既有素材和本批模块标记的定向扫描，不是所有可能素材的全面识别；按用户限制没有迁移原有 Panel，构建产物不宜公开分发。

## OPEN

完整 ZIP 格式和对抗样本、安全审计、异步 CPU/解压内部峰值内存、真实 PNG 完整性及解码预算；真实系统文件夹授权与浏览器兼容；真实 1.21.1 客户端/JAR 验证及默认预算适配；多层/overlay/filter、atlas、字体、游戏视觉；超大 Panel 接缝的既有 PENDING；现有静态素材的移除与分发问题。当前不得宣称全面安全或原版资源包兼容。

## 2026-10-28 网页测试入口

用户随后授权在网页暴露文件选择入口。工作区工具栏新增「资源包检查」浮层，可选择 ZIP 或文件夹、查看校验/错误、按 `assets/namespace/...` 查询、取消读取及清除内存会话；点击外部关闭浮层不丢失会话。此入口使用现有单层核心，不导入设计 JSON、不写历史或本地数据库，也不将资源用于画布或导出。关闭页面后会话释放；不支持目录选择的浏览器禁用文件夹选项。

`npm.cmd run build`（含 typecheck）通过，Vitest 82/82；Chrome 156.0.8078.48 模拟 DPR 1/2 的 `npx.cmd playwright test tests/resource-panel.spec.ts tests/resource-core.spec.ts tests/workspace-layout.spec.ts --trace off` 10/10。覆盖合成 ZIP/目录选择、路径查询、失败后保留旧资源会话、点击外部关闭、清除及文档/历史不变。通过 Playwright 模拟文件选择，不代表系统原生选择器或权限弹窗已人工验证。构建现在包含资源核心；两张既有派生 Panel 的内嵌风险仍保留。此前安全与兼容 OPEN 不因入口可用而关闭。
