# 轻量字体预览

画布和设计区 PNG 都调用 `src/render/previewFont.ts` 的同一文字测量、截断与 Canvas 绘制函数。无字体时使用浏览器系统 monospace；用户可在未选中组件的右侧区域选择自己有权使用的字体文件，浏览器解码后优先使用该字体，缺字由系统回退。失败显示状态并恢复系统字体。字体只在当前页面会话中使用，不写入项目 JSON、历史或 IndexedDB，不打包用户字体。

导出先提交文档输入并捕获字体 generation 和资源 revision，等待所选字体加载，再捕获视觉资源并生成 PNG；等待期间或生成期间字体或资源变化会取消批次。状态中的“用户字体”只表示浏览器成功加载文件，不证明其为 Mojangles 或具有全部字形。10 MiB 文件大小是本网站的策略。

当前参考文字为浏览器近似：不同操作系统、浏览器、字体、字形回退、DPR、缩放和抗锯齿可能改变字宽和像素；系统没有某字形时仍可能显示缺字方框，无法保证任意字符覆盖。此实现不模拟游戏 provider、精确 advance、复杂文字布局或游戏内视觉一致性。字号、位置和裁切使用共享逻辑，但不保证不同设备像素相同。

Playwright 字体专项使用本机 Windows Arial 文件作为用户选择的可读测试字体，文件并未放入项目；以延迟 FontFace.load 模拟加载，检查混合英数中文、真实导出 PNG 与预览、损坏文件回退。Chrome 模拟 DPR 1 的专项通过；DPR 2 亮色文字区域的二值像素差为 258，超过测试当前阈值 200，保持 OPEN，需进一步区分高 DPR 抗锯齿和潜在定位差异。此项测试在断言失败处停止，因此 DPR 2 的后续损坏字体回退未由该次测试验证。其他浏览器、真实物理 DPR、实际 Mojangles 用户字体和用户人工视觉验收保持 OPEN。

验证命令：`npm.cmd run typecheck`、`npm.cmd run build` 和 `npm.cmd test` 在最后一次无障碍标签微调前通过，Vitest 86 项通过。独立启动 Vite 后以 `npx.cmd playwright test --config=playwright.manual.config.ts --reporter=json --trace off --timeout=6000` 执行全套 Chrome 模拟 DPR 1/2：首次 103 项通过、49 项失败，部分旧用例仍等待选中组件时隐藏的工具栏，且新状态角色干扰了旧的通用 status 定位；该角色随后改为 aria-live。6 秒超时也不适合判断大文件及性能测试，因此不得将全部失败归因为产品缺陷。修正后以 `--workers=2` 重跑全套，进程退出 1；随后 Windows 返回 `CreateProcessWithLogonW failed: 1909`，无法启动读取结果文件的进程，最终细分结果尚未读取。两次结果分别保存在项目根目录 `full-playwright-result.json` 和 `full-playwright-final.json`。这些测试不是同一代码版本，不能合并计数；完整回归、最终代码的重新构建及失败分析保持 OPEN。
