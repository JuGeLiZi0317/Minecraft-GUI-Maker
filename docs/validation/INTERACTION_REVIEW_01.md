# 第一批交互修订与合并回归

2026-10-27，范围仅为用户反馈的四项 A+B 交互问题。未扩展 C～H，未创建 Git 提交或执行分支合并。

## 修订结果

| 反馈 | 当前行为 | 验证 |
|---|---|---|
| 文字只能在属性面板编辑 | Button、EditBox、StringWidget可双击就地编辑；Enter或失焦提交一次、Esc取消；仍保留右侧属性入口 | 三类型各测试保存、单条历史、撤销、取消；EditBox超长输入拒绝、组合输入中的Enter不提前提交 |
| “回退文字”难理解 | UI改称“预览文字”，并说明设计器按此预览，游戏实际文字由翻译键对应的语言文件决定；类型选择改为“直接输入文字／使用翻译键” | 翻译键模式下双击只改fallback，kind和key原样保留；失焦提交 |
| Rectangle修改ARGB未见变化 | 已有绘制逻辑经Canvas像素实测确认有效；补充颜色小样、透明度说明及Enter／失焦应用提示 | 不透明红、蓝、半透明绿的画布像素断言通过，撤销恢复蓝色 |
| Zoom及鼠标操作不自然 | 画布内Alt+滚轮以光标位置为中心缩放25%～400%，非被动监听阻止该区域默认行为；右键拖动随时平移，左键拖组件；保留工具栏缩放和平移工具 | 真正浏览器鼠标滚轮与按键组合、指针锚定、页面viewport/DPR/visualViewport不变、右键平移不改文档/历史、左键仍移动组件 |

EditBox双击编辑的是“输入初值”，占位文字仍在属性面板单独编辑。翻译模式的“预览文字”不等于自动生成语言文件，也不保证运行游戏时各语言的显示内容；本次未更名JSON中的fallback字段，保持已有文件兼容。

ARGB必须是 `#AARRGGBB`，AA为透明度：FF不透明、00完全透明。完整有效输入后按Enter或离开输入框才应用，不会在输入一个不完整颜色时写入无效文档。半透明绿 `#8000FF00` 在当前设计区背景上合成为 `[14,147,26,255]`，测试直接读取画布像素，不仅断言JSON字段。

## 本轮真实验证

- `npm.cmd run typecheck`：PASS，退出码0。
- `npm.cmd run build`：PASS，退出码0，主JS约595.10kB/gzip182.51kB；原有大于500kB提示仍保留。
- `npm.cmd test`：37/37 PASS，两个测试文件。
- `$env:GUI_BROWSER_CHANNEL='chrome'; npm.cmd run test:e2e`：**28/28 PASS**，退出码0，0跳过/失败/不稳定；耗时约60秒，精确时间见[原始报告](playwright-interaction-review-01.json)。

其中原有14项A+B测试保持通过，新增7个场景在DPR1/2各运行一次，共14项；覆盖双击、翻译文案、输入长度与组合输入、颜色像素、Alt滚轮和左右键职责。新的300节点样本随完整回归产生，保存为 [DPR1](interaction-review-01-performance-dpr1.json) 与 [DPR2](interaction-review-01-performance-dpr2.json)，不替换上一阶段历史样本，也不设FPS门槛。

## 覆盖范围与OPEN

沿用本机Chrome 156.0.8078.47、1440×1000 CSS px、独立context模拟DPR1/2，在正常权限终端执行。原有[验收记录](AB_VALIDATION.md)中的下载浏览器解压、沙箱收尾、物理DPR/其他浏览器覆盖和包体积OPEN项均未关闭。

Alt滚轮在画布内使用真实Playwright鼠标滚轮输入验证；区域外使用可取消WheelEvent检查“未被画布监听器拦截”，不宣称控制或验证所有浏览器/扩展在区域外的快捷键行为。组合输入Enter使用isComposing事件验证保护分支，未以各系统的真实输入法候选窗进行人工覆盖。

本轮的新增用例已加入常规 `test:e2e`，供下一轮合并测试持续执行；只运行本批可使用 `npx.cmd playwright test tests/interaction-review.spec.ts`（同样先设置Chrome通道）。

## 修改入口

- `src/canvas/Canvas.tsx`：滚轮/鼠标适配、双击入口。
- `src/canvas/InlineTextEditor.tsx`：就地文字草稿、验证、提交与取消。
- `src/ui/Inspector.tsx`：通俗文案、ARGB提示及颜色小样。
- `src/App.tsx`、`src/styles.css`：任意缩放比例显示和编辑器样式。
- `tests/interaction-review.spec.ts`：本批浏览器回归。
- `README.md`、`docs/architecture/AB_SCHEMA_PROFILE.md`：操作与序列化说明。
