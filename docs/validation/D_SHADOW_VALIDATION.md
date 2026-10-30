# D-Shadow 验证与用户验收

2026-10-29，目标 Minecraft 1.21.1 / NeoForge 21.1.244 / Java 21。合同见 [D-Shadow 合同](../architecture/D_SHADOW_CONTRACT.md)。

## 自动化

- `npm.cmd run typecheck`：退出 0。
- `npm.cmd run build`：退出 0；保留 Vite 大于 500 kB 的 chunk 提示。
- `npm.cmd test`：111 通过、0 失败，退出 0。
- 浏览器专项：外部 Vite、本机 Chrome、模拟 DPR 1/2，24 通过、0 失败、0 跳过，退出 0；[原始报告](../../d-shadow-focused.json)。
- 完整回归：172 通过、0 失败、0 跳过、0 flaky，退出 0；[原始报告](../../d-shadow-full.json)。

浏览器测试使用用户本机客户端 JAR；不会上传资源。阴影用户流程覆盖五类控件、开关、Canvas 和 PNG 变化、旧 JSON、0.5.0 升级、撤销重做、保存刷新、JSON 往返、非法旧版拒绝及字体更换时导出取消。既有测试覆盖资源代次、基础控件及导出。初次沙箱内浏览器访问本机服务器被拒绝；后使用沙箱外外部 Vite 完成测试。上述模拟 DPR 不等于物理设备验证。

## 手工验收

1. 在项目目录运行 `npm.cmd run dev`，在浏览器打开终端显示的本机地址。
2. 添加 Button、EditBox、StringWidget、Checkbox、CycleButton；依次选中，在 Inspector 勾选、取消「文字阴影」，观察文字变化。Rectangle 不应出现开关。选中 StringWidget 时可确认颜色没有随开关变化。
3. 对旧 JSON 导入后检查阴影默认关闭；切换开关后撤销、重做，观察设计与版本变化。等待保存提示后刷新，检查设置保留。
4. 选择「导出规格」，下载权威 JSON、参考 PNG、规格及 Prompt；检查 JSON 的 `props.textShadow` 和规格中每个文字节点的有效 `textShadow`。重新导入 JSON 验证往返。

实际游戏字体、GUI Scale、真实物理 DPR、跨浏览器和输入法仍为 OPEN；资源解析安全和内存预算、默认 Playwright webServer 收尾问题及素材分发权利也继续保持 OPEN。未声称游戏像素一致。
