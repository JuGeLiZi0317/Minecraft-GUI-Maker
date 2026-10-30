# Button / EditBox 资源纹理预览

2026-10-28。状态：**浏览器自动化范围通过；游戏内视觉对照 PENDING**。本批只改变 Button 和 EditBox 背景的网页预览，保留字体、现有 Panel、权威 JSON、历史、持久化和游戏缩放算法。

## 渲染与状态

`App.tsx` 将同一个 `LayeredResources` 传给资源面板和 Canvas；资源成功切换或清除改变仅供预览使用的 generation。Canvas 通过 `LayeredResources.sprite()` 取得同一资源层解析出的 PNG 字节及各自 metadata，调用浏览器 `createImageBitmap` 真正解码、核对尺寸；失败/不支持时显示对应诊断并保留中性预览。旧 effect 完成时关闭过期 bitmap，generation 变化清除 raster 缓存。无基础 JAR 时使用原近似绘制。所有选择仅在当前页面内存，资源不写项目文档、IndexedDB、导出或上传。

Button：enabled 常态 `button`，鼠标悬停或文本编辑焦点 `button_highlighted`，disabled `button_disabled`。EditBox：bordered 且未在原地编辑时 `text_field`，文本编辑焦点 `text_field_highlighted`；无边框不画背景。编辑器选择不等同游戏焦点；游戏交互模式、键盘导航焦点与所有状态转换尚未模拟。EditBox hover 不触发 focused 图，editable 不参与图片选择。文本继续使用浏览器 monospace，大小、阴影、布局及本地化不等同游戏字体。资源预览下，底部标明字体和导出差异；导出面板明确 PNG 仍用网页近似控件、不嵌入用户纹理。

`src/render/spritePreview.ts` 用 PNG 全图尺寸与 metadata 逻辑尺寸对应，按 [GuiGraphics.java:1033](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/GuiGraphics.java:1033) 实现 stretch、tile、九宫格边框裁减、中心平铺、尾部裁切与源尺寸相同的特殊分支。该源码在一般九宫格右侧中段使用左边目标宽度；非对称情况下实现保留这个 1.21.1 源码行为，而不宣称其为通用规则。九宫格先合成整数逻辑像素，再一次最近邻绘制，以避免切片变换时分别抗锯齿产生接缝。raster cache 按 sprite ID 和目标尺寸复用，最多128项/32 MiB；尺寸变化新建、资源切换清除，单组件超过4096轴或4,194,304像素、平铺超过100,000次会停止该纹理并在组件上标记不可用。既有 Panel 路径与其超大尺寸 PENDING 未修改。

## 自动化证据

Windows、Node 24.17.0 / npm 11.13.0、Chrome 156.0.8078.48、Playwright 1.56.1、视口 1440×1000，模拟 DPR 1/2。`npm.cmd run typecheck`、`npm.cmd run build` 通过（既有大 chunk 提示）；`npm.cmd test` **86/86**。`$env:GUI_BROWSER_CHANNEL='chrome'; $env:GUI_CLIENT_JAR='<本机 JAR 路径>'; npx.cmd playwright test --trace off` **130/130**，包括两次本机 JAR 实验；[完整结果](sprite-preview-results.json)。随后只扩展测试、没有改变产品代码；`npx.cmd playwright test tests/sprite-preview.spec.ts --trace off` **10/10**，含旧解码延迟后切换资源，[补充结果](sprite-preview-supplement-results.json)，不可将两批数字相加。

合成 PNG 是浏览器 Canvas 运行时生成，未复制游戏资产；测试实际 Canvas 像素，覆盖五种状态、无边框、stretch/tile/非对称九宫格、3×3小尺寸、平铺末端、0.5/1/2 zoom、分数 pan、模拟 DPR1/2、GUI Scale、损坏 PNG、清除/切换、旧 bitmap 解码延迟、文档及历史不变。分数落点的纯色九宫格在切片边界附近抽样未发现暗线；没有覆盖所有纹理、尺寸及浏览器。既有 Panel 回归通过。资源切换后 IndexedDB 记录不变未单独做专门数据库逐字节断言，现有持久化完整回归通过；自动测试不等于用户实机视觉对照。

## 本机客户端与性能

以用户本机 JAR `minecraft_1.21.1_client.jar`，SHA-256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`，无覆盖包，五图及 mcmeta 均来自该基础层；图片200×20、元数据九宫格200×20，边框3/3/1/1/1。Chrome DPR1 生成 Button 和 EditBox 普通状态的网页截图，存于项目目录外的 `D:/Minecraft/AIStudio/workspace/gui-maker-preview-evidence/client-sprite-preview.png`，截图含用户自备纹理，不复制原始资产至公开仓库。该图仅是浏览器结果，没有游戏截图或环境对照，**不能证明游戏内视觉一致**。

补充微基准：Chrome 无头，原创16×16 PNG 解码约0.6～0.8 ms，首次24×16合成约0.2～0.4 ms；300个相同缓存节点，五组各20次 Canvas 绘制约4.2～6.6 ms/组。时间仅为该环境 JS 调用采样，不含真实 Konva 拖拽、GPU完成及大纹理解码，不能推断 FPS 或其他设备性能。缓存复用及尺寸变化有自动测试；切换时的旧异步结果有延迟解码实验。5张图片并发解码、真实大资源的峰值内存与浏览器内部解压仍未测。

## OPEN / PENDING

需使用同一客户端版本、资源栈、GUI Scale、分辨率，在游戏中分别对照 Button 普通/悬停/键盘焦点/禁用及 EditBox 无焦点/焦点/无边框，记录截图和纹理差异；当前没有这组游戏内证据。真实字体、语言与输入框行为不在本批。ZIP 安全独立审计、真实大文件内存、其他浏览器与物理 DPR、超大 Panel 接缝等既有事项继续 OPEN；当前仍未证明所有极端尺寸或资源的视觉无缝。资源包层级和 atlas 功能仍受第二批支持范围限制。

## 用户人工验证

用户随后反馈：网页已能正确渲染按钮和文本输入框，按钮具有交互效果，并确认本次验证通过。该反馈确认用户实际测试的网页体验；未提供逐状态游戏截图及环境信息，故不将其外推为完整游戏内视觉对照，上述 OPEN / PENDING 保留。
