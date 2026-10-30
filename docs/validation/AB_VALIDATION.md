# A+B 实施与验收记录

日期：2026-10-27（Asia/Shanghai）。范围：仅 A+B，**不声明 Minecraft GUI Maker V1 完成**。未实施 C～H、未提交/推送 Git、未部署站点。

本文件保留A+B首轮验收快照。后续双击编辑、文案、ARGB与鼠标交互修订及28项合并回归结果见[第一批交互报告](INTERACTION_REVIEW_01.md)。

最新的尺寸设置、GUI Scale与点击保存修复，以及49项单测/38项浏览器合并回归见[第二批交互报告](INTERACTION_REVIEW_02.md)。

用户已在上述自动化声明范围收束A+B，既有OPEN保留；当前阶段状态见[STAGE_STATUS.md](STAGE_STATUS.md)，独立C的结果见[C_VALIDATION.md](C_VALIDATION.md)。

## 最终实际状态

| 项目 | 结果 | 证据 |
|---|---|---|
| typecheck | PASS，退出码0 | [typecheck.txt](typecheck.txt) |
| 生产构建 | PASS，退出码0；含体积警告 | [build.txt](build.txt) |
| Vitest | **37/37 PASS**，2个测试文件，0失败 | [vitest-results.json](vitest-results.json) |
| Playwright Chrome 通道 | **14/14 PASS**，退出码0，55.7秒，0 skipped/failed/flaky | [playwright-ab-results.json](playwright-ab-results.json) |
| 生产静态预览 | Vite preview / 127.0.0.1:4174，实际 HTTP **200** | 本次使用 Invoke-WebRequest 检查；不是额外生产浏览器交互回归 |
| 页面视觉检查 | 检查四组件完整页面截图，未见布局溢出/重叠面板 | [ab-editor.png](ab-editor.png)；不代表游戏渲染保真 |
| 300节点拖动采样 | DPR1/2各3轮，完成并保存数据；**没有 FPS 合格阈值** | [DPR1](performance-dpr1.json)、[DPR2](performance-dpr2.json) |
| Playwright 下载 Chromium 的路径 | **OPEN**：完整浏览器及 only-shell 安装均在解压阶段停滞 | 本轮使用 Chrome fallback，不能把其 PASS 套用为此路径通过 |

报告中 build.txt 若含 PowerShell 对 Vite stderr 的 `NativeCommandError/RemoteException` 包装，来自构建体积 warning 的流重定向；最终 npm/Vite 退出码为0，实际无 TS 或构建错误。没有通过提高 chunkSizeWarningLimit 隐藏警告。

## 环境和固定版本

Windows x64，OS release **10.0.26200**；CPU **AMD Ryzen 7 7735H with Radeon Graphics**，16逻辑核心，Node 报告约15 GiB总内存（取整）。Node **24.17.0**，npm **11.13.0**。

| 依赖 | 固定版本 |
|---|---|
| React / react-dom | 19.2.0 / 19.2.0 |
| TypeScript | 5.9.3 |
| Vite / @vitejs/plugin-react | 7.1.12 / 5.0.4 |
| Konva / react-konva | 10.0.12 / 19.2.0 |
| Zustand / Zod | 5.0.8 / 4.1.12 |
| Vitest / @playwright/test | 3.2.4 / 1.56.1 |
| @types/node / @types/react / @types/react-dom | 24.10.0 / 19.2.2 / 19.2.2 |

package.json 不使用范围，package-lock.json v3 固定传递依赖与 integrity；.node-version 和 engines 固定当前运行时。已核查 npm registry 的版本存在性、engines 和 peerDependencies；npm ls --depth=0 无缺失依赖，安装、TS、构建、单测及真实浏览器验证共同支持该组合的本阶段兼容性。并不宣称这些是 registry 的最新版本或已经做过供应链安全审计。

实际浏览器为本机 **Google Chrome 156.0.8078.47**，Playwright `channel=chrome`、headless 模式，browser.version 与本机文件版本一致。UA 被简化显示为 HeadlessChrome/156.0.0.0。不是 Playwright 1.56.1 原配的 Chromium 141.0.7390.37。

## Playwright 覆盖矩阵

两个 project `chromium-dpr1` / `chromium-dpr2` 各7项；名称中的 chromium 是 Playwright browserName，实际通道请以上述 Chrome 记录为准。

| 场景 | DPR1 | DPR2 | 实测断言 |
|---|---|---|---|
| 四种组件完整闭环 | PASS | PASS | 四组件逐个添加、X/Y精确修改、真实鼠标移动、右下角调整、单手势历史增量、撤销/重做、真实文件下载并读取JSON、删除、文件导入和导入撤销/重做、最终文档逐字段相等 |
| Zoom 0.5 + Pan(31,-17) | PASS | PASS | 含小数的鼠标距离映射至整数坐标；调整尺寸、Esc取消移动/尺寸调整、真实平移手势只改变视图 |
| Zoom 1 + 同Pan | PASS | PASS | 同上 |
| Zoom 2 + 同Pan | PASS | PASS | 同上 |
| 非法导入 | PASS | PASS | 损坏JSON、未来Schema、伪造来源类、未知组件、悬空行为引用；文档/选择/历史均保持不变 |
| 调色板拖放与属性/取消 | PASS | PASS | 实际 dragTo 触发HTML拖放，正确位置；输入初值修改；非法W=0被拒绝；pointercancel保留原文档 |
| 300矩形节点拖动采样 | PASS（完成） | PASS（完成） | 三轮各60次真实鼠标移动、至少60个pointermove、RAF样本非空、文档仍有300节点；不设帧率阈值 |

Viewport：**1440×1000 CSS px**；每个 DPR project 是独立浏览器 context，验证了实际 `window.devicePixelRatio`，并断言 Canvas backing width = CSS width × DPR。DPR不参与领域坐标转换，导出的文档不含视图结构。

这里的“真实鼠标”指 Playwright input API 发往浏览器的鼠标事件；不是人手操作硬件鼠标。pointercancel 使用浏览器事件分发模拟系统取消信号，Esc使用键盘事件。DPR1/2并非两台物理显示器，未覆盖跨显示器拖窗、系统缩放切换、触控笔、手机触摸、Firefox/WebKit或高刷新率屏幕的实际呈现。

Vitest 另覆盖未知来源category、错误target/catalog/Java、重复ID、超界/小数/零尺寸、未知字段/props、UTF-16长度、颜色、节点/文件大小/深度上限、完整扩展往返、取消/无变化手势、历史上限、相同项目导入事务等。详见源码中具名用例。

## 300节点性能采样

运行 Vite **开发模式**，同一台机器、Chrome headless、单worker串行、Zoom2、Pan(0,0)、1440×1000 CSS px。导入300个10×10 fill矩形，25列×12行，选择最后节点并拖动；每轮60次鼠标移动，在每次移动后请求等待16ms，共3轮。因为自动化调度和输入调用有开销，实际单轮约4.2秒，不能把请求16ms当作真实移动频率。

用页面 `requestAnimationFrame` 记录采样窗口的时间间隔；窗口包含开始/结束输入开销。**这是RAF调度间隔，不是测得的绘制耗时、输入延迟或显示器FPS**，不据此换算“达到多少FPS”。浏览器无头调度、开发模式、同时运行的检查、系统负载均影响数据。本次未控制电源策略、GPU驱动或后台负载，不作跨设备性能承诺。

| DPR | 轮次 | RAF样本数 | 均值ms | p50 ms | p95 ms | 最大ms | 输入循环耗时ms |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 571 | 7.55 | 6.10 | 12.20 | 48.90 | 4189 |
| 1 | 2 | 568 | 7.66 | 6.10 | 12.30 | 73.10 | 4266 |
| 1 | 3 | 577 | 7.58 | 6.10 | 12.20 | 55.00 | 4254 |
| 2 | 1 | 574 | 7.57 | 6.10 | 12.20 | 48.90 | 4228 |
| 2 | 2 | 575 | 7.56 | 6.10 | 12.20 | 73.30 | 4269 |
| 2 | 3 | 562 | 7.68 | 6.10 | 12.20 | 54.90 | 4200 |

数据来自本次最后完整14项验收运行；原始精度、浏览器版本、硬件字段和pointerMoves计数见两个JSON。重跑只需 README 的 Chrome通道命令或相同环境下 `npm.cmd run test:perf`。

## OPEN 与风险

| ID | 状态 | 事项与影响 |
|---|---|---|
| ENV-01 | **OPEN** | Playwright下载浏览器：完整Chromium与headless-shell均在解压阶段停滞，原因未确认；已停止本次残留安装进程，未手改浏览器文件/完成标记。默认未设置通道的测试路径尚未通过。Chrome通道成功是独立实测，不能关闭此项 |
| ENV-02 | **OPEN** | 沙箱内测试能逐项完成，但收尾未退出；中止后在正常权限下重跑完整通过。沙箱路径原因未定位，复现验收使用正常权限终端 |
| PERF-01 | **OPEN** | 构建单入口JS约591.16kB（gzip181.20kB），Vite警告超过500kB。未测慢网首屏；本阶段未擅自建立网络/体积阈值或增加分包复杂度 |
| COVERAGE-01 | **OPEN** | 物理DPR显示设备、其他浏览器及真实游戏渲染未验证；当前通过范围严格限上述Chrome/context矩阵 |
| DATA-01 | 已知限制 | 无持久化，刷新丢失会话，必须JSON备份；历史只保留最近100次事务。非C模块故障，而是本阶段范围 |
| SCHEMA-01 | 已知限制 | 0.1.0仅实施A+B profile；非空行为/变量/资产明确拒绝，不能导入完整提案的未来AST示例。无数据静默降级 |
| UX-01 | 已知限制 | 主要面向桌面，窄于850px保留最小工作区宽度；设计区尺寸和标题可通过JSON导入改变，当前没有Screen属性面板 |
| VISUAL-01 | 已知限制 | Canvas用网页字体和中性色块；不还原Minecraft字体/皮肤/资源包、悬停/真实输入行为或旁白 |

可见的应用内浏览器面板在当前工具环境返回 `Browser is not available: iab`，故未交付一个持续运行的内嵌预览页；这不影响已通过的Chrome自动化或本地HTTP检查。使用README启动方式即可操作，交付截图仅为浏览器QA产物，不是D阶段PNG导出功能。

## 实现文件与操作入口

- `src/domain/`：catalog、schema、model；`src/editor/store.ts`：文档/选择/事务/历史；`src/canvas/Canvas.tsx`：Konva中性渲染与坐标适配。
- `src/ui/Inspector.tsx`：精确属性输入；`src/App.tsx`：四组件入口/图层/视图/JSON文件IO；`src/main.tsx`、styles.css和index.html：应用壳。
- `src/**/*.test.ts`、`tests/editor.spec.ts`、playwright.config.ts：验证；package.json/lock、tsconfig、vite.config和.node-version：环境与构建。
- [README](../../README.md)：实际操作及复现命令；[A+B Schema profile](../architecture/AB_SCHEMA_PROFILE.md)：当前导入边界；[四组件项目JSON](four-components-project.json)：可直接导入的本次验收样本。

本项目目录原先没有Git仓库，本次没有擅自初始化或创建提交；实现文件均交付在现有项目目录内。A+B至此停止，C～H等待后续授权。
