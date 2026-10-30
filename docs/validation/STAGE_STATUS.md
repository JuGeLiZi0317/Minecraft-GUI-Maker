# 阶段状态

> 本文是 2026-10-27 起的阶段历史记录。当前状态、后续 H1 用户实测反馈及未完成事项请先看 [项目现状与后续方向](../PROJECT_STATUS.md)；下文“E～H 未开展”等描述不代表当前代码状态。

2026-10-27，按用户明确的阶段裁定更新。

| 项目 | 状态 |
|---|---|
| A+B | 在本批声明的自动化验收范围内收束；不外推到未覆盖设备或游戏运行 |
| GUI Scale算法、浏览器预览 | 通过现有算法与浏览器测试 |
| GUI Scale游戏内视觉一致性 | **OPEN** |
| 跨输入法、物理DPR、浏览器兼容 | **OPEN**，不阻塞C |
| 下载浏览器、沙箱执行/环境收尾 | **OPEN**，不因一次正常退出而关闭 |
| C：本地持久化 | 在已声明自动化与用户实测范围内收束：双标签页新增保护、关闭后刷新恢复、导入JSON保留进度均获用户确认 |
| D：同快照导出 | 冻结0.1.0合同并完成限定实现；typecheck/build通过，61项Vitest与78项Chrome DPR1/2完整合并回归通过；D用户人工体验复核保持OPEN |
| E～H | 未授权、未开展 |

C结果：typecheck/build退出0，55项Vitest通过，Chrome通道DPR1/2下66项完整浏览器合并回归通过。其中C专项为14个场景×2 DPR=28项，其余38项为已有编辑/交互回归。详见[C验收报告](C_VALIDATION.md)，独立方案见[本地保存设计](../architecture/LOCAL_PERSISTENCE_DESIGN.md)。

用户已报告逐条复现命令执行且66项PASS，并完成上述关键流程实测；未将反馈外推至未声明的浏览器、设备或异常退出条件。

D新增设计区PNG、权威JSON、结构化实现规格、Markdown Prompt与manifest，全部使用不可变的已提交文档快照。合法草稿先提交，非法输入阻止导出；没有游戏窗口PNG或ZIP。[D验收记录](D_VALIDATION.md)包含完整证据、一次旧预期冲突的修订、原始结果、样例、失败路径和风险。游戏内视觉等既有OPEN保持不变。

用户后续反馈1×参考图难以阅读。合同现增加0.1.1放大参考图，保留1×原图和权威JSON；此次62项Vitest及14项Chrome DPR1/2导出/布局专项通过，详情和AI实际识读OPEN见 [REFERENCE_IMAGE_VALIDATION.md](REFERENCE_IMAGE_VALIDATION.md)。原D的78项记录仍作为历史结果，不外推成本轮完整回归。

随后用户单独授权设计区自绘Panel和独立背景PNG。Schema与导出合同新增0.2.0，旧0.1.0项目仍可读取；此次64项Vitest、86项Chrome DPR1/2完整浏览器回归通过，Panel元数据专项6项复验通过。证据及游戏内/用户实测OPEN见 [PANEL_BACKGROUND_VALIDATION.md](PANEL_BACKGROUND_VALIDATION.md)。完整E～H仍未授权。

2026-10-28用户进一步要求使用由原版发射器GUI四角裁切拼接的16×/32×用户素材，并将背景PNG导出为透明填充的方形图。新版Schema/导出合同0.3.0保留旧项目与自绘样式，完整浏览器回归94项及留白/素材专项8项通过、Vitest 66项通过；[详细记录](DISPENSER_PANEL_VALIDATION.md)。游戏内实际显示继续OPEN。

2026-10-28 用户报告其游戏实测 GUI 已与原版一致；本轮编辑体验优化完成，保留 16× 衍生底板和无底板作为新设计选项，并兼容旧底板数据。build/typecheck、66 项 Vitest 与 Chrome 模拟 DPR 1/2 的 102 项浏览器回归通过，详见 [画布可用性验证](CANVAS_USABILITY_VALIDATION.md)。该实测反馈不外推到未测试的游戏配置；物理 DPR、真实输入法及其他浏览器等仍为 OPEN。

这不代表 GUI Maker V1 完成，也不关闭上述 OPEN 项。后续阶段需另行授权。
