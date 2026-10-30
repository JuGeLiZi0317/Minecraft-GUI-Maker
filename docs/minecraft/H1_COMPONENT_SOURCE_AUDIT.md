# H1：Checkbox 与 CycleButton 源码审计（实施进行中）

目标：Minecraft Java 1.21.1、NeoForge 21.1.244、Java 21。以下为本地映射源码静态证据，不表示网页实现或游戏内视觉验证已完成。源码位于 `D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/`；版本及文件指纹参见 `GUI_COMPONENT_AUDIT.md`。

## Checkbox

| 项目 | 已核实事实 | 源码定位 |
|---|---|---|
| 类与构造 | `Checkbox extends AbstractButton`；公开入口 `builder(message, font)`，builder 可设置位置、最大宽度、初始选择、tooltip 和回调 | `Checkbox.java:17,29-36,50-52,103-163` |
| 尺寸 | 方框为 17×17 GUI px；默认宽度为 17 + 4 + 游戏字体测量宽度；实际宽度取默认宽度与 maxWidth 的较小值，高度取 17 与多行文本高度的较大值 | `Checkbox.java:38-55` |
| 换行与位置 | 多行文本的最大宽度设为控件宽度；文本从方框右侧 4 px 开始，垂直居中于方框；每行高度 9 | `Checkbox.java:31-33,94-99`、`MultiLineTextWidget.java:24-30,38-40,59-77` |
| 状态贴图 | 四个 Sprite 为 `widget/checkbox`、`widget/checkbox_highlighted`、`widget/checkbox_selected`、`widget/checkbox_selected_highlighted`；选择依赖 selected 和 focus，**不是 hover**；此方法不按 active 选择独立禁用贴图 | `Checkbox.java:18-21,81-95` |
| 回调 | onPress 切换 selected 后调用 `OnValueChange`；builder 还可绑定 `OptionInstance<Boolean>` | `Checkbox.java:59-62,136-148,155-169` |

兼容分析：现有节点 `bounds` 要求固定的整数宽高并限制在设计区内，而原版宽高由游戏字体与 maxWidth 派生。浏览器字体不是游戏字体，浏览器测出的宽高不能当作精确游戏尺寸；设计边界、maxWidth 和实际游戏布局之间需要明确合同，尤其是文本可能在控件宽度之外绘制。任意调整高度或把固定 bounds 直接声称为原版构造尺寸均不正确。具体合同及其溢出校验仍 PENDING。

## CycleButton

| 项目 | 已核实事实 | 源码定位 |
|---|---|---|
| 类与构造 | `CycleButton<T> extends AbstractButton`；builder 接收将 T 转成 Component 的函数；可设置值列表、初值、tooltip supplier 和只显示值；create 可指定 x/y/width/height/name | `CycleButton.java:21,152-155,169-177,183-226,230-261` |
| 初值 | 空默认列表在 create 时抛错；未显式指定初值时使用列表初始位置；withInitialValue 在值存在于默认列表时更新索引 | `CycleButton.java:210-218,239-246` |
| 文字 | 只显示值或使用 `CommonComponents.optionNameValue(name, value)`；值的显示文本来自 valueStringifier；不意味着 ID 或业务值本身等于显示文字 | `CycleButton.java:111-123,245-246` |
| 输入与回调 | 按下前进、Shift 按下后退；滚轮按方向切换；用户切换更新值后调用回调。`setValue` 更新值但不调用该回调 | `CycleButton.java:68-108` |
| 背景 | 继承 `AbstractButton.renderWidget`，按 active 和 hovered-or-focused 选择按钮 Sprite | `CycleButton.java:21`、`AbstractButton.java:30-35` |
| Tooltip | tooltip supplier 随值更新；完整交互需要游戏端业务实现 | `CycleButton.java:32,63-65,109-115,205-207` |

设计合同建议：非空选项数组中的每项使用唯一稳定 ID 和独立显示文本；初始 ID 必须引用存在的选项；显示格式显式区分仅值和名称加值。应用回调、泛型业务值映射、替代列表和按选项生成 tooltip 不能视为已经实现。

## 既有合同影响和状态

- 现有 `schema.ts` 仅接受 0.1.0、0.2.0、0.3.0 及固定 catalogVersion；增加新节点必须引入明确的新版本及旧版本读取策略，避免旧软件错误接受带未知节点的旧版本文档。尚未实施。
- `resources/layered.ts` 目前仅允许五个 Button/EditBox Sprite；Checkbox 四个 ID 需要在现有受限解析器内扩充并验证，不应绕过资源会话。尚未实施。
- 浏览器预览字体近似与游戏字体不同，Checkbox 派生尺寸及换行的游戏内一致性保持 PENDING。
- 两个组件的领域模型、编辑器、渲染、导出、历史、持久化及自动化测试均尚未完成；本文件不构成阶段验收。
