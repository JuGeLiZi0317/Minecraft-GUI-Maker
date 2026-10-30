# 参考 PNG 的资源视觉快照

2026-10-28。结论仅覆盖 Button / EditBox 已支持资源、初态及下述测试条件；字体、游戏内一致性与其他浏览器仍 OPEN。

## 实现和生命周期

画布和导出共同使用 `src/render/spritePreview.ts` 的 `spriteForNode`、`SpriteRasterCache`、`rasterSprite`；不截取编辑器页面。Canvas 仍用交互态渲染；PNG 使用设计初态：enabled Button 正常、disabled Button 禁用、bordered EditBox 非焦点、无边框不画背景。选中、悬停、编辑焦点、网格、缩放和平移不进入导出。透明设计区仍按既有合同透明，放大参考图保留既有阅读衬底。

`useExports` 先按原草稿屏障提交有效输入并捕获不可变文档，再同步读取资源代次及基础/覆盖层标识。`captureVisual` 只查询初态需要的 Sprite，将 PNG 解码成该批独有的 ImageBitmap，捕获各自来源、缩放数据和 SHA-256；两张图复用这一批素材和栅格缓存。异步查询、解码和摘要时检查代次，整批生成完发布前再次检查；改变则取消整批且不发布链接。失败、取消或成功后释放位图和缓存。用户在批次生成后切换资源时，重开旧导出结果会明确提示它仍属于旧快照。manifest 的 `visualResources` 记录代次、层、状态、sprite来源、缩放、摘要及诊断；PNG 元数据记录对应资源代次。权威 JSON 不新增资源字段。

无基础资源时沿用中性绘制；损坏、缺失或 unsupported 的 Sprite 使用与画布相同的中性背景并显示纹理不可用标记，画布及导出面板/manifest 均可见诊断。单组件超过既有 sprite 栅格预算时也标记并回退。Canvas 和 PNG 的文本仍是两条近似文字绘制路径，不能声称字体或完整图像逐像素一致。无边框 EditBox 现在不再错误填充 PNG 背景。导出说明明确字体近似、图像是初态而非悬停/焦点。

## 实际 PNG 像素证据

合成 PNG 由 Playwright 运行时用浏览器 Canvas 制作，未复制 Minecraft 素材。320×180 设计、组件相同位置：无资源时画布与 PNG 的正常 Button 内部 RGB 均为 `(49,67,84)`；基础包下 Button `(240,0,0)`、EditBox `(238,238,0)`、禁用 Button `(0,0,238)`；覆盖按钮图片后画布与 PNG 均为 `(238,0,238)`。透明区域为 `(0,0,0,0)`，启用网格和选择不进入 PNG。zoom 0.5/1/2、pan 0.37、模拟 DPR1/2 时实际 PNG 仍320×180且纹理采样一致。

对 8×8 原创渐变素材，实测 Canvas 与导出 PNG 在指定同一点的 stretch、tile、非对称 nine_slice 分别为 `(0,0,60)`、`(0,60,60)`、`(90,60,60)`；9×9 小按钮的右下角为 `(210,210,60)`。损坏 PNG 与不支持的覆盖 atlas 会显示诊断，导出回退背景同画布。异步解码时清除资源会取消整个导出。用户本机 1.21.1 JAR 的正常 Button 也在两个模拟 DPR 下比较了画布与实际 PNG 对应像素，均一致；JAR 身份仍为自报版本且来源未认证。这些是代表性采样，不等于整张图或游戏内像素一致。

## 执行结果和限制

Windows、Node 24.17.0、npm 11.13.0、Chrome 156.0.8078.48、Playwright 1.56.1、视口1440×1000、模拟 DPR1/2：

- `npm.cmd run typecheck`、`npm.cmd run build` 通过（既有 chunk 大小提示）；`npm.cmd test` **86/86**。
- `$env:GUI_BROWSER_CHANNEL='chrome'; $env:GUI_CLIENT_JAR='<本机 JAR 路径>'; npx.cmd playwright test --trace off` **142/142**，零跳过，[完整结果](export-visual-results.json)。包括既有编辑、Panel、导出、本地保存和真实 JAR 测试。
- 随后仅补充测试，产品代码不变：`npx.cmd playwright test tests/export-visual.spec.ts tests/client-jar-local.spec.ts --trace off` **14/14**，[补充结果](export-visual-supplement-results.json)，新增 IndexedDB 前后内容相同、未支持 atlas 诊断、旧批次提示和真实 JAR 的实际 PNG 像素对照。两次结果不相加作为单次完整回归。
- 初次三种缩放测试的两个预期采样值计算错误：伸展最近邻落点为0而非30，非对称九宫格中心宽度为5而非4；依据源码几何与实际画布核对后修正，完整回归和补充专项通过。

游戏截图逐状态对照、跨浏览器/物理 DPR、字体/复杂语言与异步输入、ZIP 独立安全审计、峰值内存及超大 Panel 接缝仍 OPEN/PENDING。资源缺失时正常状态与用户当前鼠标悬停状态可能不同，这是明确的导出初态定义。用户素材没有上传或自动持久化，但用户主动生成的 PNG 自然包含所选纹理的渲染像素；既有本地 Panel 素材与渲染保持不变。下一阶段可以研究 Minecraft 字体，但本批没有实施。
