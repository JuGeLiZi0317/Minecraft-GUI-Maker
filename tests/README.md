# 测试

- `unit/`：Vitest 单元测试，运行 `npm test`。
- 本目录下的 `*.spec.ts`：Playwright 浏览器测试；辅助模块和合成资源夹具也在本目录。
- 首次运行浏览器测试前执行 `npx playwright install chromium`，然后运行 `npm run test:e2e`。测试默认启动本地 Vite 服务，报告写入 `test-results/`，不提交到仓库。
- 客户端 JAR 测试可通过环境变量 `GUI_CLIENT_JAR` 指定用户自己的 Minecraft 1.21.1 客户端 JAR；未提供时相关可选测试会跳过。
- 旧版 32× Panel 的专项测试需要本地提供 `src/gui/panel_32x.png`；该文件未包含在仓库中。其他测试和普通构建不需要该素材。

已有的 Playwright 下载落盘环境问题、跨浏览器与真实游戏视觉差异仍待验证。测试输出属于本地运行产物，不代表游戏内验证。
