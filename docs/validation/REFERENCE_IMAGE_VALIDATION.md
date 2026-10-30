# 放大参考图检查与验证

2026-10-27。用户反馈默认320×180导出图文字太小。检查确认0.1.0原图严格使用1图像像素=1 GUI逻辑单位；代码在原始画布绘制9px浏览器字体，文字可读性受原图尺寸限制。这是既有合同的结果，不是浏览器DPR或Zoom导致的尺寸错误。

本次保留1×透明设计区PNG，新增从同一快照直接重绘的放大参考图。默认320×180 → 1280×720（4×），深色底仅供阅读；不把背景或放大坐标写入权威JSON。大图按8192单轴及16,777,216总像素上限选择4/3/2/1整数倍率，1×无法放大时显式提示。批次和manifest版本更新至0.1.1，合同差异见 [D_EXPORT_CONTRACT_0_1_1.md](../architecture/D_EXPORT_CONTRACT_0_1_1.md)。

`npm.cmd run build`（含typecheck）退出0，最后一次独立typecheck退出0；`npm.cmd test` 62/62通过。Chrome 156.0.8078.47通道，1440×1000 CSS px，模拟DPR1/2；D导出和工作区专项14/14通过，记录为 [reference-image-results.json](reference-image-results.json)。本次没有重跑全部80项浏览器回归；此前完整结果见 [workspace-layout-full-results.json](workspace-layout-full-results.json)。构建仍存在大于500kB包体提示。

自动化实际解码1×和4× PNG，验证尺寸、颜色、衬底、隐藏初态、比例和PNG元数据，以及与JSON同revision和manifest SHA-256；改变Zoom、Pan、GUI Scale预览、选中状态及模拟DPR不影响输出。通过延迟PNG编码，在快照后修改文字并对比重新导出相同文字的两图像素，确认快照一致。测试第二张图编码失败时无任何下载入口且不改变历史，1×回退与倍率选择由单测覆盖。样例六文件在 [d-sample-0.1.1](d-sample-0.1.1/)；已核对其中五个文件的SHA-256，并人工查看放大PNG。

**OPEN：AI Agent实际识读效果尚未验证。** 不同AI模型或图片传输管线可能缩放、压缩图片；4×并不保证正确读字，长文字可能按设计预览被截断。应始终以权威JSON的完整文字和坐标为准，放大图只辅助理解布局。也未证明游戏内视觉与浏览器近似一致；既有其他浏览器、物理DPR与跨输入法问题仍保持OPEN。
