# Minecraft GUI Maker

一个用于设计 Minecraft GUI 的网页编辑器，目标环境为 Minecraft Java 1.21.1、NeoForge 21.1.244 和 Java 21。

项目提供组件编辑、有限的行为预览、本地保存，以及 JSON、参考 PNG、规格、Prompt 和 ZIP 导出。它不生成 Java 源码，也不替代游戏内验证。

## 运行

需要 Node.js 24.17.0 和 npm 11.13.0：

```sh
npm ci
npm run dev
```

使用浏览器打开终端显示的地址。构建使用 `npm run build`；单元测试使用 `npm test`，浏览器测试使用 `npm run test:e2e`（需安装 Playwright 浏览器）。测试源码位于 `tests/`，其中 `tests/unit/` 为单元测试。测试报告仅保存在本地。

仓库包含用户提供的 `src/gui/panel_16x.png` 和对应元数据。该纹理由 Minecraft 发射器 GUI 纹理裁切拼接；使用或分发 Minecraft 相关素材时，请自行确认适用的权利和条件。旧版 32× Panel 素材不包含在仓库中；需要该兼容样式时，可在本地提供 `src/gui/panel_32x.png`。

设计默认保存在当前浏览器的本地存储中，建议导出 JSON 备份。具体进度和限制见 [项目状态](docs/PROJECT_STATUS.md)。

## 许可证

项目代码采用 [MIT 许可证](LICENSE)。该许可证不授予 Minecraft 或用户提供的其他第三方素材的权利。
