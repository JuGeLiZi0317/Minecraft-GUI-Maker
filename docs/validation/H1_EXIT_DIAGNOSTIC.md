# H1 Playwright 退出诊断

2026-10-28，Windows，Playwright 1.56.1，Chrome 模拟 DPR 1。上轮使用普通 `playwright.config.ts` 的完整 156 项均显示 `ok`，但进程未退出、`test-results/results.json` 不存在；手动中断后退出码 1。不能把这些输出当作正常完成的完整回归。

本次受限对照：

1. `$env:GUI_BROWSER_CHANNEL='chrome'; npx.cmd playwright test tests/h1-render.spec.ts --project=chromium-dpr1 --trace=off`：1 个用例显示通过，但进程继续运行，未生成默认 JSON。Vite 日志所示 Node PID 20656 仍在 `Get-Process` 列表中。为释放已启动的测试会话，随后手动中断；退出码 1。
2. 在上述 Vite 仍运行时，设置 `GUI_BROWSER_CHANNEL=chrome`、`PLAYWRIGHT_JSON_OUTPUT_NAME=h1-manual-diagnostic.json`，执行 `npx.cmd playwright test tests/h1-render.spec.ts --config=playwright.manual.config.ts --project=chromium-dpr1 --reporter=json --trace=off`：1 通过，进程退出码 0，真实报告 `../../h1-manual-diagnostic.json` 已写入。

该对照支持问题与默认配置管理的 `webServer` 收尾有关，且外部 Vite 模式可绕过该受限场景。它不能单独证明哪个子进程或句柄阻塞：`Get-CimInstance Win32_Process` 和 `Get-NetTCPConnection` 被环境拒绝访问；没有可用进程树或句柄证据。不能排除 reporter、Windows shell 或其他收尾因素；根因 OPEN。未修改账户或系统配置，也未伪造结果。外部模式的单个用例结果不能外推为完整回归通过。

用户随后提供 `docs/temp/cmd-result.txt`：用户侧 PowerShell 能运行这两条查询；文件中查询前已返回 PowerShell 提示符。该快照显示 5173 正在监听，4173 只有 `TimeWait` 项，没有 4173 的监听记录。默认表格未包含命令行、父 PID 或连接所属 PID，也没有测试原始输出与退出码，不能将 node 或 5173 监听进程归属于该次 Playwright/Vite 运行，亦不能据此认定测试自然退出或定位阻塞句柄。与此前工具环境的访问拒绝属于不同执行上下文；原因仍 OPEN。

用户进一步确认：5173 的 PID 10128 是项目的 `node .../vite/bin/vite.js --host 127.0.0.1`，父 PID 27416；保留的 PowerShell 中 `$LASTEXITCODE` 为 0。用户表示此前运行默认配置的单项 H1 测试并显示通过；结合提示符及退出码，该用户侧单项运行正常返回。5173 是开发服务，不能把它当成默认测试配置的 4173 服务。用户侧结果与本工具会话内单项运行的收尾悬挂不同，不足以确定差异根因；完整回归的默认 webServer 收尾及 Windows 执行环境差异仍 OPEN。用户侧此项结果不替代完整回归报告。

用户停止 5173 服务后，在本工具环境再次执行默认配置单项命令。测试显示 1 项 `ok`，等待期间进程没有退出，也没有生成 `test-results/results.json`。`netstat -ano -p tcp` 显示仅 127.0.0.1:4173 的 PID 9996 处于 LISTENING，未显示 5173 监听；Vite 启动日志中的 PID 同为 9996，而 Playwright 输出中的 worker PID 34044 已不在 `Get-Process` 结果中。随后手动中断测试会话，退出码 1。此对照排除了“必须同时运行 5173 服务才会复现”的假设，但无法证明阻塞发生在具体哪个句柄或子进程；用户本地运行正常与工具环境悬挂的差异仍 OPEN。
