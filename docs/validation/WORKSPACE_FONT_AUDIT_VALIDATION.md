# 工作区布局与字体审计验证

2026-10-28，本机 Chrome，Playwright 1.56.1，模拟 DPR 1/2，1440×1000 视口。`npm.cmd run typecheck`、`npm.cmd run build` 和 `npm.cmd test` 通过；Vitest 7 文件、86 项通过。构建提示 JS chunk 超过 500 kB，未在本次范围内优化。

执行 `GUI_BROWSER_CHANNEL=chrome`、`GUI_CLIENT_JAR=<本地 1.21.1 客户端>` 下的 `npx.cmd playwright test tests/workspace-resize.spec.ts tests/workspace-layout.spec.ts tests/font-resource-audit.spec.ts --trace off`：8 项均输出 ok，覆盖命名、失焦提交、非法草稿阻止导出、撤销重做、侧栏调整、刷新恢复、浮层与字体资源读取。测试输出完成后进程没有自行退出，手动中断，故本次进程退出状态为 1；退出问题 OPEN，不把本次称为完整正常退出的合并回归。

旧 `editor.spec.ts`、`exports.spec.ts`、`persistence.spec.ts` 的 DPR1 合并尝试中，前四项 editor 用例等待已被选中组件时隐藏的工具栏而超时，另有两项通过，随后中断；旧用例需适配新的取消选中工作流并完整重跑，保持 OPEN。不可把这些超时替代为产品行为通过，也不可将不同时刻的结果相加作为一次完整回归。

项目名称使用现有文档提交事务，保存和撤销沿用现有机制；拖动侧栏仅改变视图状态。真实物理 DPR、其他浏览器、窄窗口和用户实际操作仍需验证。字体审计见 `../minecraft/FONT_SYSTEM_AUDIT.md`、`../minecraft/FONT_RESOURCE_DEPENDENCIES.md`、`../architecture/FONT_PREVIEW_DESIGN.md` 与 `FONT_VALIDATION_PLAN.md`；字体渲染器未更改。
