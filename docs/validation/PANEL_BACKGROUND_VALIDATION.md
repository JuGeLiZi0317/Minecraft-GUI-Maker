# Panel 背景验证记录

2026-10-27。用户单独授权可调整尺寸的九宫格风格Panel与独立PNG；不包含图片导入、ZIP、信标业务或新增原版控件。正式边界与Schema/导出兼容说明见 [PANEL_BACKGROUND_CONTRACT.md](../architecture/PANEL_BACKGROUND_CONTRACT.md)。

## 结果

- `npm.cmd run build`（包含typecheck）通过；最终独立 `npm.cmd run typecheck` 通过；`npm.cmd test` **64/64通过**。构建仍有原有大于500kB的打包警告。
- Chrome 156.0.8078.47通道、1440×1000 CSS像素、模拟DPR1/2，完整浏览器回归 **86/86通过**：[panel-browser-full-results.json](panel-browser-full-results.json)。随后在测试中增加PNG内批次元数据验证和样例留存，Panel专项再次 **6/6通过**：[panel-browser-followup-results.json](panel-browser-followup-results.json)。最后一次增加的是测试断言与样例存储，没有改动产品代码。
- 覆盖旧0.1.0导入、新0.2.0项目往返、启用/撤销/重做、无效尺寸原子拒绝、改变宽高、保存后刷新恢复；确保背景切换不改变现有组件坐标。
- 实际浏览器解码设计图及背景纹理，确认独立图尺寸360×200、1 PNG px = 1 GUI单位、预期像素颜色，按钮区域的独立背景像素未包含按钮。检查七文件manifest和SHA-256，Panel PNG自带相同批次和修订元数据。延迟编码后更改Panel，验证纹理仍属于旧快照；第三次PNG编码失败时整批不发布并保留文档/历史。
- 浏览器测试输出的七文件样例见 [panel-sample](panel-sample/)；六个非manifest文件的字节数和摘要已复核，并查看 [独立背景图](panel-sample/gui-r3-d638046a.background.png)。测试图片是项目程序自绘，没有游戏素材。

## 仍未验证

- **OPEN：游戏内显示**。没有把本次新纹理集成到目标Mod，也没有运行Minecraft或验证实际纹理采样、资源包、游戏GUI Scale和视觉一致。Prompt明确提醒使用纹理实际宽高的`GuiGraphics.blit`重载；这来自锁定源码静态确认，不是游戏运行结论。
- **OPEN：用户人工实测**。尚未收到用户对本次Panel外观、尺寸操作、七文件下载和同Agent工作流的反馈。旧应用不能读取Schema 0.2.0，用户应保留原0.1.0设计备份。
- 当前只有覆盖整个设计区的一种自绘浅灰底板；尚不能像信标纹理一样在背景图中绘制槽位装饰、导入原版/自定义贴图、添加多个独立Panel或导出ZIP。按钮等现有组件仍作为独立组件，按逻辑坐标叠加，不被烘入背景PNG。
- 其他浏览器、物理DPR、跨输入法及原有环境问题继续OPEN。测试用模拟DPR不等同于物理设备覆盖。
