# H1 正常用户流程验证

目标 Minecraft 1.21.1 / NeoForge 21.1.244；2026-10-28，Windows，本机 Chrome，Playwright 1.56.1，模拟 DPR 1/2，1440×1000。正式创建入口与严格 Schema 0.4.0 导入已开放。浏览器用户实测 PENDING。

`tests/h1-user-flow.spec.ts` 通过普通界面导入 0.3.0 项目、添加 Checkbox、撤销与重做版本升级、编辑位置/文字/初始勾选、添加和编辑 CycleButton、保存并刷新、导出参考 PNG、拒绝不合法旧版 H1 文件并导入合法 0.4.0 文件。`src/editor/store.test.ts` 分别验证两种类型的升级原子事务、删除和 Panel 操作不降级。正常流程未覆盖每一种资源失效、每一种预览交互和所有视图变换，不能把一般回归等同于 H1 全矩阵。

最终代码执行 `npm.cmd run typecheck`、`npm.cmd run build`（均退出 0）、`npm.cmd test`（99 通过、0 失败、退出 0）。外部 Vite、`GUI_BROWSER_CHANNEL=chrome` 下，`npx.cmd playwright test tests/h1-user-flow.spec.ts --config=playwright.manual.config.ts --reporter=json --trace=off`：2 通过、0 失败、0 跳过、退出 0，报告 `../../h1-user-flow-final.json`。同环境含用户自备 1.21.1 客户端 JAR，`npx.cmd playwright test --config=playwright.manual.config.ts --reporter=json --trace=off --workers=2`：164 通过、0 失败、0 跳过、0 flaky、退出 0，报告 `../../h1-user-full.json`。JSON 报告输出位置使用 `PLAYWRIGHT_JSON_OUTPUT_NAME` 指定。

游戏内 Checkbox 自然尺寸及换行、浏览器字体视觉差异、真实物理 DPR、跨浏览器、默认测试服务退出异常，以及 H1 的完整资源损坏和缩放组合继续 OPEN；不得从此结果宣称游戏内像素一致。构建仍提示 JS chunk 超过 500 kB。CycleButton 选项当前以 JSON 编辑，预览不实现游戏业务回调。
