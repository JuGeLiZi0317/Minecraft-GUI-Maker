# H2-P 验证记录

2026-10-29，Windows，Chrome，Playwright 模拟 DPR 1/2；非真实游戏或物理 DPR 验证。构建代码与所测产品代码一致。

- `npm run typecheck`：退出 0。
- `npm run build`：退出 0；Vite 提示 JS chunk 超过 500 kB。
- `npm test`：退出 0，17 文件、123 测试通过。
- Panel 专项：`h2p-focused.json`，退出 0，16 通过；覆盖旧 Panel、纹理与独立几何。
- 独立几何画布像素、PNG、历史、刷新和 ZIP 内容：`h2p-geometry-final.json`，退出 0，2 通过。ZIP 内容由浏览器中生成的 Blob 捕获并解析，不能代替系统下载完成的验证。
- 完整 Playwright：`h2p-playwright.json`，退出 1，174 通过、22 失败、0 跳过；全部失败均为 Playwright 下载读取 `canceled`，涉及旧版 JSON、ZIP 和恢复记录流程，也包括不含 Panel 的设计。根因未确认。其他 Panel 专项通过不证明下载行为可靠。
- 备用 Playwright Chromium 下载诊断：`h2p-download-diagnostic.json`，退出 1，所需 Chromium 可执行文件未安装，无法以此复核。Chrome 正常产生下载事件和 ZIP Blob，但自动化读取被取消；尚需用户实际下载并打开 ZIP 验证。原有跨浏览器、物理 DPR、游戏内视觉及测试环境问题保持 OPEN。
