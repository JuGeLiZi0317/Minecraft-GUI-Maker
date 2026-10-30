# UI-R1A 验证记录

基线为 Git 提交 `9899c37`，标签 `pre-ui-r1`；UI-R1A 改动留在工作区。基线排除了用户提供的 `src/gui/` 素材、`docs/temp/` 和 `docs/validation/panel-sample/`，新克隆需要另外提供本地 Panel 素材才能复现相关构建及测试。

最终产品代码的验证：

| 检查 | 结果 | 原始记录 |
| --- | --- | --- |
| typecheck | 退出码 0 | `docs/validation/ui-r1a-typecheck.log` |
| build | 退出码 0 | `docs/validation/ui-r1a-build.log` |
| Vitest | 退出码 0，20 文件、128 测试通过 | `docs/validation/ui-r1a-test.log` |
| 工作区、Canvas、CreativeTab 专项 Playwright | 26 通过，退出码 0 | `ui-r1a-focused-final.json` |
| 完整 Playwright | 退出码 1，194 通过、22 失败 | `ui-r1a-final-playwright.json`；退出码 `docs/validation/ui-r1a-playwright-exit.log` |

完整回归使用本地 Chrome、模拟 DPR 1 和 2、外部 Vite 服务及本地 1.21.1 客户端 JAR。22 项失败均为 Playwright 的 `download.saveAs` 或 `download.createReadStream` 返回 canceled；这是已有测试服务环境问题，不能视为完整回归通过，也不能证明真实浏览器下载落盘。菜单专项通过捕获 Blob 验证 JSON、PNG 和 ZIP 内容。GUI Scale 测试根据新浮层开闭状态操作；原先假定画布点击必然关闭面板，在新布局下不成立。

## 用户试用

打开已有设计，使用文件菜单生成单项导出及 ZIP；选中节点后检查全局工具栏、属性编辑、撤销重做、网格、Zoom 与 GUI Scale。拖动两侧分隔线调整宽度，尝试收起、边缘浮出、固定和自动隐藏；拖动左侧上下分隔线后刷新，并切换本地设计检查布局是否保留。在较窄窗口继续移动节点并检查坐标。实际下载文件和游戏内行为需由用户另行验证。

## OPEN

- Playwright 下载落盘取消；真实浏览器落盘尚需本批人工验证。
- 跨浏览器、物理 DPR、高浏览器缩放以及不同设计间偏好保持的代表性人工检查仍待完成。
- 项目构建依赖本地未入 Git 的 Panel 素材；基线标签不是这些素材的备份。
- 行为面板继续使用原有中央浮层；本批没有实现任意停靠或后续 UI-R1B。
