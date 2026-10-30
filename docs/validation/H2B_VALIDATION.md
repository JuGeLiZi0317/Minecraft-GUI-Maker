# H2-B 验证记录

2026-10-29，Windows / Chrome，Playwright 使用模拟 DPR 1/2；目标 Minecraft 1.21.1、NeoForge 21.1.244。合同见 `../architecture/H2B_TAB_GROUP_CONTRACT.md`。

- typecheck：退出 0；build：退出 0，有原有 JS chunk >500 kB 提示。
- 全量 Vitest：退出 0，19 文件、127 测试通过；包括组初态唯一、共享内容、跨组引用拒绝、删除保护、旧版门禁和历史。
- 专项 `../../h2b-focused-final.json`：退出 0，6 通过。真实 JAR 资源的两个标签经过正常 UI 创建、归组、绑定内容和实际点击；检查选中贴图与内容同步切换、F2 显示请求受组范围约束、原始可见值保持、预览期 revision/历史/IndexedDB 不变、设计初态 PNG、刷新、JSON 导入、规格/manifest 和 ZIP Blob 内容。另有 H2-A 原版资源与回退回归。
- 完整 `../../h2b-final-playwright.json`：退出 1，182 通过、22 失败、0 跳过。22 次均为 Playwright 下载读取取消（16 次 `download.saveAs`、6 次 `download.createReadStream`），与 H2-A 既有环境问题一致；原因未确认。文件落盘下载未由本轮自动化证明。完整回归使用同一最终产品代码，随后仅增强专项测试的纹理像素断言。

用户验收：创建两个 CreativeTab 与两组非标签组件；依次选中标签，在 Inspector 输入同一组 ID，勾选各自内容并按“保存标签组”。第一个组成员自动成为初始选中项，也可在另一个成员勾选“初始选中”。打开“行为”、开始画布行为测试，收起面板并点击标签；切换后重置。JSON、PNG 与 ZIP 使用设计初态。共享组件可由同一组的多个标签勾选，跨组绑定会拒绝。关联内容原始可见值保留，解除关联时恢复；显式 F2 覆盖只在预览会话中生效，不能显示非活动组内容。

网页实测与目标游戏内行为仍由用户验证；应用不生成 Java 或提供游戏运行时。自动化 ZIP 以捕获生成 Blob 的方式核对，不等价于真实下载完成；跨浏览器、物理 DPR 和既有测试服务环境问题继续 OPEN。
