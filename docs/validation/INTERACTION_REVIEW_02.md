# 第二批交互修订：设计区、GUI Scale及点击保存

2026-10-27。仅扩展当前A+B画布与属性交互，没有进入持久化、行为、积木或Java生成阶段。

## 实施结果

- 新增“设计区与游戏 GUI Scale”折叠面板，可修改初始及现有设计区宽高，1～8192 GUI px，应用是一个可撤销事务。缩小导致组件越界时原子拒绝；已有项目JSON格式不变。
- 新增游戏帧缓冲预设、GUI Scale自动及动态等级、Unicode偶数倍率修正，以及只读画布预览。按完整游戏窗口等比适配网页空间，设计区在可用GUI区域居中，超出窗口时裁切并提示。预览不改变文档或历史。
- 修复点击画布其他位置丢失文字：过去Konva的pointerdown可能先选择/开始拖动，后来的blur保存会被store手势门控忽略，或编辑框已因选择变化卸载。现在document捕获阶段先提交合法文字，再允许选择/拖动/导出继续；blur与Enter保留，Esc仍取消。
- 修复文字编辑提示层拦截下方组件点击：仅输入框接收指针事件，提示浮层允许点击穿透。文字提交和随后组件拖动是两条独立历史事务，不相互吞并。

320×180不是原版上限；具体可见GUI尺寸由帧缓冲与实际倍率决定。8192是本工具尺寸输入上限，非游戏常量。完整源码证据、版本比对和示例表见[GUI Scale审计](../minecraft/GUI_SCALE_AUDIT.md)。

## 最终验证

| 检查 | 实际结果 |
|---|---|
| typecheck | PASS，退出码0 |
| build | PASS，退出码0；JS约600.85kB，gzip184.72kB，保留原体积警告 |
| Vitest | **49/49 PASS**，3个文件；新增12项GUI Scale及尺寸事务断言 |
| Playwright完整合并回归 | **38/38 PASS**，退出码0，0跳过/失败/不稳定；[原始报告](playwright-interaction-review-02.json) |
| 页面视觉 | 已检查[GUI Scale预览截图](gui-scale-preview.png)，确认控件、窗口与说明布局正常 |

完整回归中原有28项保持通过，新增5项在DPR1/2各执行一次，共10项。尺寸用例验证应用、撤销、重做、越界缩小拒绝、下载JSON保留设计区尺寸；预览用例验证1920×1080下1/2/3/4等级、缩放后可用区域、1280×720向上取整和Unicode自动4倍、只读及JSON/历史不变；文字用例对Button、EditBox、StringWidget分别覆盖点击空白、点击其他组件并拖动、图层、导出。

单测补充3840×2160自动9倍、Unicode自动10倍、小窗口、非法参数、尺寸上限和原子失败检查。GUI Scale是独立TS行为模型，并未执行Java或运行游戏。

## 复现与范围

```powershell
Set-Location -LiteralPath 'D:\Minecraft\AIStudio\workspace\Minecraft GUI Maker'
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
$env:GUI_BROWSER_CHANNEL = 'chrome'
npm.cmd run test:e2e
# 仅本批：npx.cmd playwright test tests/screen-scale.spec.ts
Remove-Item Env:GUI_BROWSER_CHANNEL
```

沿用Chrome 156.0.8078.47、1440×1000 CSS px、context模拟DPR1/2及正常权限终端。原有下载浏览器、沙箱收尾、物理DPR/其他浏览器、真实游戏/输入法与包体积OPEN项不关闭。预览是按源码计算的窗口布局近似，不是原版字体或渲染保真测试。

首轮新增回归暴露提示层阻挡点击，修正后10项专项测试通过（调试时关闭trace）。随后恢复默认trace策略执行全部38项并完整退出0；未用调试运行替代最终合并回归。失败调试被中止后曾遇到4173占用，已停止本项目残留测试进程再重跑；该环境收尾问题仍纳入原ENV-02的OPEN范围。

本轮也再次执行300节点采样，数据单独保存在[DPR1](interaction-review-02-performance-dpr1.json)和[DPR2](interaction-review-02-performance-dpr2.json)，不覆盖前两轮历史记录，不建立FPS门槛。其RAF调度间隔、无头浏览器与自动化开销的限制沿用首轮验收说明。

## 修改入口

`src/domain/guiScale.ts`、`src/domain/guiScale.test.ts`、`src/editor/store.ts`、`src/ui/ScreenSettings.tsx`、`src/canvas/Canvas.tsx`、`src/canvas/InlineTextEditor.tsx`、`src/ui/Inspector.tsx`、`src/App.tsx`、`src/styles.css`和`tests/screen-scale.spec.ts`。使用说明及A+B profile已更新。没有修改游戏源码、复制资产或生成Java代码。
