# D-Export 命名与 ZIP 验证

2026-10-29。实现与兼容规则见 [0.3.1 合同](../architecture/D_EXPORT_NAMING_ZIP_CONTRACT.md)。

最终产品代码执行 `npm.cmd run typecheck` 和 `npm.cmd run build` 均退出 0；构建保留大于 500 kB 的 chunk 提示。`npm.cmd test` 114 通过、0 失败、退出 0。使用外部 Vite、用户本机客户端 JAR、本机 Chrome 和模拟 DPR 1/2，受影响浏览器专项 44 通过、0 失败、0 跳过、0 flaky，退出 0：[原始报告](../../d-export-focused.json)。完整回归 186 通过、0 失败、0 跳过、0 flaky，退出 0：[原始报告](../../d-export-full.json)。

覆盖中文、特殊字符、设备名、超长和旧数据空白名称；测试独立 JSON/PNG 与一键 ZIP、同批文件字节一致、manifest 引用、有无 Panel、旧版导入、保存状态及历史不变；测试资源或字体变更取消打包。使用 Python 标准库 `zipfile` 检查生成 ZIP 的目录、Unicode 文件名和 CRC。浏览器测试不能证明物理 DPR、所有浏览器或游戏视觉。

手工验收：修改项目名称后点击顶部「导出 ZIP」，解压查看权威 JSON、两张 PNG、规格、Prompt、manifest 和按需 Panel 图；也可点击「导出规格」，分别下载需要的文件或在面板内下载同批 ZIP。若资源或字体会话变化，重新生成批次后再打包。导出前有有效但尚未提交的编辑草稿时，按照既有合同先提交该编辑；导出操作本身不新增历史记录。
