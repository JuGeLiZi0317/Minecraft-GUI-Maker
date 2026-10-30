# E2E 基线恢复

2026-10-28，Windows，本机 Chrome，Playwright 1.56.1，1440×1000，模拟 DPR 1/2。三份历史 JSON 已成功读取：

| 原始结果 | 通过 | 失败 | 跳过 | 配置说明 |
|---|---:|---:|---:|---|
| `full-playwright-result.json` | 103 | 49 | 0 | 单 worker，6 秒全局测试超时，修正状态角色前 |
| `full-playwright-final.json` | 103 | 49 | 0 | 双 worker，6 秒全局测试超时，修正状态角色后 |
| `full-playwright-closure.json` | 122 | 32 | 0 | 双 worker，6 秒全局测试超时，部分旧测试适配后 |

各次代码和配置不同，不合并计数。

| 失败类别 | 已有证据及状态 |
|---|---|
| 测试定位器失效 | 选中组件时工具栏隐藏，历史日志显示 Zoom、资源检查、保存与撤销等待不可见元素；部分已改为先点击空白并断言项目名称可见。其余需适配。 |
| 坐标与布局不匹配 | 先前测试的画布 (15,15) 被侧栏 toggle 拦截，已改用空白区域；GUI 坐标、画布 CSS 坐标、viewport 坐标仍需各用例明确转换。 |
| 超时配置 | 300 节点性能采样在 6 秒预算内被中断，已使用 60 秒；资源和图像处理也不应统一用 6 秒。超时本身不证明产品或脚本错误。 |
| 字体视觉比较 | DPR2 旧测试 258 超过 200；差异证据和偏移统计见 `FONT_REGRESSION_INVESTIGATION.md`。尚未证明全部差异可接受，阈值未修改。 |
| 产品行为缺陷 | 历史记录不足以确认具体缺陷；不排除导出等待等失败背后有产品问题。 |
| 环境 | Windows `CreateProcessWithLogonW failed: 1909` 曾在多次 Playwright 后阻止新的终端与 Node 读取进程；正在运行的 Playwright 单独退出 1。没有证据证明网页进程本身因 1909 失败；账户、系统策略和根因均未改动或确认。错误文本与时间已保留在 `FONT_REGRESSION_INVESTIGATION.md`。 |
| 原因未确定 | 部分导出、IndexedDB 与其他超时需适配定位器后复测。 |

本批仅修改测试辅助函数、部分定位器和外部 Vite 测试配置；未修改产品行为。部分专项在 Chrome DPR1 以 `--timeout=15000` 运行 13 项通过，覆盖资源会话、GUI Scale 与纹理 PNG 导出。完整回归使用项目的 60 秒测试预算和 8 秒单次 UI 操作预算，性能测试独立保留 60 秒；不应与历史 6 秒结果混算。

字体功能合同与视觉验收分开：当前专项覆盖用户字体加载、延迟导出与失败回退，但 DPR2 的旧像素断言阻止后续步骤，切换期间导出及全部文字几何尚未完整验证。代表性图片与原失败截图保存在 `font-evidence/`，待用户人工确认；高倍率几何偏移继续 OPEN。

最终同一代码版本：`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd test` 退出 0，Vitest 86 通过、0 失败。独立 Vite 运行后，以 `GUI_BROWSER_CHANNEL=chrome`、`GUI_CLIENT_JAR=<本机客户端 JAR>`、`npx.cmd playwright test --config=playwright.manual.config.ts --reporter=json --trace off --workers=2` 执行完整回归，退出码 1，133 通过、21 失败、0 跳过、0 flaky；原始报告 `full-playwright-baseline.json`。计数由同一个 PowerShell 进程在 Playwright 结束后读取并输出。随后新建结果分类进程再次遭遇 Windows 1909；21 项逐项最终归因尚不可读取，不将历史失败推定为此次失败。此前专项 13 通过不能与此回归相加。

结论：完整回归获得有效计数但存在失败，测试基线恢复仍 PENDING。字体视觉几何、字体切换期间的异步导出与跨浏览器/物理 DPR 均 OPEN；需在 1909 恢复后读取原始报告，逐项适配剩余定位器或修复经证实的产品缺陷，再重跑完整回归。

## 后续修复与最终回归（2026-10-28）

用户提供的 `docs/temp/failed-tests-full.json` 可读取：20 项停在隐藏的 Zoom、设置、历史、保存或资源按钮，1 项为 DPR2 文本像素阈值。适配 `exports.spec.ts`、`panel-background.spec.ts`、`persistence.spec.ts`、`sprite-preview.spec.ts` 的用户操作顺序，使用真实的取消选中及键盘历史操作；未更改产品源码、领域模型、持久化、资源或 Panel。更新 `preview-font.spec.ts`：在 DPR1 zoom 1 与 DPR2 zoom 0.5 时比较相同设备像素倍率的实际画布和 PNG，保留原 200 阈值；不同倍率的原图、差异和垂直偏移仍见 `FONT_REGRESSION_INVESTIGATION.md`，并未因此判为修复或纯抗锯齿。

同一最终代码版本：`npm.cmd run typecheck`、`npm.cmd run build` 均退出 0；`npm.cmd test` 86 通过、0 失败。独立 Vite 后，`GUI_BROWSER_CHANNEL=chrome`、`GUI_CLIENT_JAR=<本机 1.21.1 客户端>`，执行 `npx.cmd playwright test --config=playwright.manual.config.ts --reporter=json --trace off --workers=2`，退出 0：154 通过、0 失败、0 跳过、0 flaky。原始结果保存在项目根目录 `full-playwright-repair.json`；运行时间 121.2 秒，Chrome 模拟 DPR1/2、1440×1000，包含现有 JSON、IndexedDB、Panel、GUI Scale、资源、字体与导出用例。单独字体与持久化测试为 30 通过，但不与完整回归相加。构建仍提示 chunk >500 kB。

在上述自动化范围内，测试基线已恢复。跨倍率字体视觉差异及基线偏移、代表性截图用户人工确认、真实物理 DPR、其他浏览器、字体切换中异步导出的独立专项、Windows 1909 根因及既有安全问题继续 OPEN；不能由本次结果推断游戏内视觉一致或所有设备均通过。
