# H2-A 验证记录

2026-10-29，Minecraft 1.21.1 客户端 JAR 为用户本地自报资源，Chrome 自动化模拟 DPR 1/2；未在游戏内运行。代码合同见 `../architecture/H2A_CREATIVE_TAB_CONTRACT.md`。

- typecheck：退出 0；build：退出 0（Vite 原有 chunk >500 kB 提示）。
- 全量 Vitest：退出 0，18 文件、125 测试通过；覆盖旧版本拒绝、固定尺寸、升级与撤销、14 个状态/列 Sprite ID 的选择。
- 标签专项 `../../h2a-focused-final.json`：退出 0，4 项通过。通过正常用户入口选择本地 JAR、配置 Panel、添加和编辑标签；检查资源 manifest、设计 PNG、版本、撤销/重做、刷新、JSON 导入、ZIP Blob 内容。无资源时验证回退，以及未选中在 Panel 后方、选中在 Panel 前方时 Canvas 与 PNG 的像素。
- 最终产品代码的完整 Playwright `../../h2a-final-playwright.json`：退出 1；180 通过、22 失败、0 跳过。失败全部是自动化下载读取取消：16 次 `download.saveAs: canceled`，6 次 `download.createReadStream: canceled`，包括无 Panel 的旧功能。根因未确认。标签专项通过不能证明浏览器下载完成；ZIP 内容通过捕获生成 Blob 验证，不等同文件落盘验证。
- 最终产品代码之后专项测试文件增加了 JSON 导入和属性撤销检查；不改变产品代码。用户此前反馈浏览器正常，不能据此声称本轮标签下载已人工验收。

人工验收：启动网页，选择本地 1.21.1 客户端 JAR，启用 Panel；取消选中节点，将 Panel Y 设为 28 并使其位于设计区内。添加 CreativeTab，将 Sprite X 与 Panel X 对齐、Y 设为 0，调整列与初始选中状态，观察两态与 4 像素重叠。导出 PNG、JSON、ZIP，确认系统实际下载并解压；刷新后检查设计恢复，再导入 JSON。资源会话刷新后需重新选择 JAR。把 ZIP 交给目标项目开发者按 Prompt 实现后，用户可在 Minecraft 1.21.1 / NeoForge 21.1.244 中比较；本批不生成或执行 Java。当前无运行中的 Minecraft 客户端，未进行游戏内测试。浏览器下载实测、游戏视觉、物理 DPR 与其他既有 OPEN 仍待验证。
