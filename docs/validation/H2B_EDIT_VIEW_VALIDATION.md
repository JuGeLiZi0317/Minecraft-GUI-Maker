# H2-B 编辑视图验证记录

2026-10-29，Chrome 自动化模拟 DPR 1/2；真实 JAR 为用户本地 1.21.1 客户端资源。行为语义和复现定位见 `../architecture/H2B_EDIT_VIEW_CONTRACT.md`。

- 修改前的最小复现 `../../h2b-repro-before.json`：退出码 0，2 项通过，证明两个同组标签的无资源回退像素完全相同。该最小复现当时没有关联内容；回退函数本身与内容无关。修改后的专项增加了不同内容节点，另以真实 JAR 和 Panel 重叠验证有效 Sprite 对调。
- typecheck：退出码 0，原始输出 `h2b-edit-typecheck.log`；build：退出码 0，`h2b-edit-build.log`，保留 Vite chunk >500 kB 提示；全量 Vitest：退出码 0，19 文件、127 项通过，`h2b-edit-vitest.log`。
- H2-B/H2-A 专项 `../../h2b-edit-final-focused.json`：退出码 0，12 项通过。覆盖不同内容节点、真实 Sprite 与回退、非初始标签节点编辑和撤销、共享关联、测试和 F2、设计 PNG、编辑中 ZIP 各条目与单项一致、JSON/规格/Prompt/manifest、刷新恢复、预览的历史/revision/IndexedDB 隔离。ZIP 内容通过捕获生成的 Blob 验证，不等于系统下载落盘。
- 完整 Playwright `../../h2b-edit-final-playwright.json`：退出码 1，188 通过、22 失败、0 跳过。失败全为现有下载流取消：16 个 `download.saveAs: canceled`、6 个 `download.createReadStream: canceled`，根因未确认。完整回归使用同一最终产品代码；随后仅给专项复现测试增加不同内容节点。

实际网页、真实资源包差异、文件落盘下载和 Minecraft 游戏内行为仍待用户代表性验证；未生成 Java 或运行游戏。原有其他浏览器、物理 DPR 与测试环境 OPEN 保留。
