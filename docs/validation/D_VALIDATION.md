# D：同一修订的参考导出验收

日期：2026-10-27。范围仅D；[冻结合同](../architecture/D_EXPORT_CONTRACT.md)版本0.1.0。目标 Minecraft Java 1.21.1 / NeoForge 21.1.244 / Java21。E～H未开展，未生成Java、游戏资产或新组件；未重构A+B+C领域与存储。

## 实现与文件

- `src/exports/snapshot.ts`：严格校验、深拷贝与递归冻结，单次捕获revision；原始JSON精确UTF-8字节SHA-256。
- `src/exports/draftBarrier.ts`、`useExportDraft.ts`：先校验全部已注册领域草稿，再提交合法输入。`Inspector`、`ScreenSettings`、`InlineTextEditor`仅增加导出所需输入边界及组合输入保护。
- `src/exports/designPng.ts`：独立Canvas2D绘制，只读快照，不截取Konva/DOM；透明底、可见初态、按数组叠放，受控PNG tEXt元数据与CRC。
- `src/exports/specification.ts`：事实/设计意图/OPEN分层，使用固定审计目录的组件来源；用户文字放JSON代码块，动态围栏防止Markdown逃逸。
- `src/exports/bundle.ts`：从同一快照构建JSON、PNG、派生规格、Prompt及manifest摘要，不读取活动store。
- `src/exports/useExports.ts`、`src/ui/ExportPanel.tsx`、`src/App.tsx`、`src/styles.css`：先完整生成再统一发布五个下载链接；生成期间允许编辑，旧快照有提示；失败或重导出释放旧URL，卸载后不发布过期结果。
- `src/exports/export.test.ts`、`tests/exports.spec.ts`：D自动化；`tests/screen-scale.spec.ts`仅更新非法尺寸草稿的导出预期，以符合用户本轮冻结合同。
- 合同、README、AGENTS、ROADMAP、STAGE_STATUS同步记录范围。没有新增依赖，package-lock.json与权威Schema保持原合同。

权威project.json未增加导出字段。revision可因撤销下降或导入重复，因此关联还使用完整exportId、时间与文档摘要。PNG操作上限每轴8192、总像素16,777,216，超过拒绝整批；单独JSON仍可备份合法大设计。本批没有游戏窗口PNG和ZIP。

## 环境与复现

Windows，本机Node24.17.0、npm11.13.0、Playwright1.56.1，已安装Chrome通道156.0.8078.47。每个测试独立browser context；1440×1000 CSS px，deviceScaleFactor分别1/2，一个worker。通过localhost安全上下文使用Web Crypto。不修改正常用户浏览器的设计数据。

```powershell
Set-Location -LiteralPath 'D:\Minecraft\AIStudio\workspace\Minecraft GUI Maker'
npm.cmd run typecheck
npm.cmd run build
npm.cmd test -- --reporter=json --outputFile=docs/validation/d-vitest-results.json
$env:GUI_BROWSER_CHANNEL = 'chrome'
npx.cmd playwright test --trace off
# 只复现D：npx.cmd playwright test tests/exports.spec.ts --trace off
Remove-Item Env:GUI_BROWSER_CHANNEL
```

浏览器测试使用正常权限的Chrome通道；受限沙箱/下载Chromium路径的旧OPEN保留。`--trace off`避免本机既有失败trace打包干扰；断言仍为真实浏览器执行，不是静态检查。E2E自行启动并结束4173端口Vite。

## 验收覆盖

| 内容 | 实际方法 |
|---|---|
| 冻结与异步一致性 | 单测修改原文档并尝试修改冻结嵌套对象；浏览器将原生toBlob回调延迟1200ms，快照后继续改按钮文字；核对JSON/spec/Prompt/PNG元数据的旧revision和文字，恢复同文字后比较解码像素摘要 |
| 输入边界 | 未按Enter的属性文字、画布就地文字、宽高草稿后点击导出；无效W/宽度、超过EditBox maxLength、合成compositionstart未结束时阻止；Esc恢复后可导出。组合事件测试不等于真实跨输入法验证 |
| 文件关联及权威性 | 检查五文件、精确文件SHA-256及长度、相同reference、PNG所有chunk CRC和tEXt；实际点击下载JSON、读取并重新导入与快照等价 |
| PNG逻辑尺寸/无辅助元素 | 浏览器createImageBitmap真实解码；320×180及修改后400×220；透明底、矩形红色像素、边界外/手柄处透明、隐藏组件不绘制；改变选择后整图像素摘要相同 |
| 视图隔离 | Zoom0.5/1/2、Pan31/-17、GUI Scale只读预览下解码像素完全相同；两个模拟DPR context分别执行 |
| 证据分层 | 三Widget与fill绘制方法来源分别核对，gameRuntimeVerified=false，OPEN保留，sourcePath与绝对坐标；恶意围栏/指令文字只作为JSON数据 |
| 失败及重试 | toBlob(null)、Canvas2D不可用、crypto.subtle不可用、8192×8192拒绝整批；无下载链接、不改文档/历史；成功批次再次失败时五个旧URL已撤销，恢复后可重试 |
| 历史与原有能力 | 无草稿的成功/失败导出不改文档、选择和历史；合法草稿仍通过既有编辑事务；完整编辑/输入/GUI Scale/IndexedDB/多标签冲突回归 |

初轮D专项6/8通过，2项失败为测试状态定位器同时命中已展开的GUI Scale output和底栏状态；定位到底栏后8/8通过。新增故障路径后，首次完整回归76/78通过：旧尺寸测试在非法宽度草稿仍存在时等待JSON下载，和D必须阻止非法输入的合同冲突。测试已改成先断言阻止、修正宽度再下载；未放宽尺寸边界或跳过断言。最终结果见下方运行结果，不以早期失败隐藏未决项。

## 运行结果

最终完整合并浏览器回归 **78/78通过**（原有66项+D专项6场景×2DPR=12项），无失败、跳过或flaky，耗时134.91秒。运行起点2026-10-27T12:52:12.174Z。原始记录为 [d-playwright-results.json](d-playwright-results.json)。单测 **61/61通过**（原有55项+D的6项），原始记录为 [d-vitest-results.json](d-vitest-results.json)。独立typecheck与构建均退出0。构建JS631.15kB（gzip195.81kB），仍有大于500kB警告，本批没有扩展成打包优化任务。

300简单节点原有拖动采样随完整回归执行：每个DPR三轮，每轮60次真实鼠标移动、请求16ms间隔、Zoom2/Pan0；requestAnimationFrame间隔p95分别为DPR1的18.2/18.1/12.3ms、DPR2的12.2/18.2/18.2ms。没有增加FPS通过门槛，也不把rAF间隔当作所有交互耗时；CPU、内存、浏览器、每轮完整数据见 [d-performance.json](d-performance.json)。本轮未做大尺寸PNG的性能承诺。

可下载样例五文件在 [d-sample](d-sample/)；由已通过的浏览器测试生成。其PNG已实际解码并检查尺寸、透明底、图层及元数据；不是Minecraft截图。

## 风险与人工复核

- **OPEN：游戏内视觉一致性**。网页使用中性自绘和浏览器字体，不证明真实文字宽度、截断/滚动、旁白、禁用态、资源包、语言或GUI Scale视觉一致。无Java/runClient验证。
- **OPEN：跨输入法、物理DPR、其他浏览器**。本轮只有Chrome模拟DPR1/2；合成组合事件不能替代Windows实际IME，不能外推Firefox、Safari或其他设备。
- **OPEN：环境收尾及下载Chromium/沙箱路径**。采用已验证Chrome通道，未用本次正常退出关闭旧环境问题。
- **OPEN：D用户人工体验复核**。自动化已检查文件内容；用户尚未反馈本轮五文件下载、实际IME边改字边导出、外部图片查看器的使用体验。建议保留五文件一同传给实现者，并核对manifest。此项不冒充已完成。
- PNG像素上限只是分配保护，不保证所有机器都能生成上限图像。浏览器/系统级内存耗尽或强杀无法保证可捕获；测试注入的编码/绘图/摘要故障不等于真实OOM覆盖。
- 浏览器字体变化可能改变PNG像素；合同保证同快照数据及批次关联，不保证跨机器字节级相同PNG。外部工具可能剥离PNG元数据，原始manifest与project.json应同时保存。
- 合法草稿提交可增加revision、历史及C自动保存；随后PNG失败也不会撤销用户已经合法提交的编辑。无草稿时导出不改变历史。Prompt/spec均不可作为项目导入格式，冲突以权威JSON为准。

D交付后停止，不将A+B+C+D的闭环称为V1完成，也不进入E～H。
