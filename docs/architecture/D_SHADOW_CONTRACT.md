# D-Shadow 文字阴影合同

目标 Minecraft Java 1.21.1 / NeoForge 21.1.244 / Java 21。Button、EditBox、StringWidget、Checkbox 和 CycleButton 的 `props.textShadow` 是布尔值；Rectangle 没有该字段。Schema 0.5.0 允许该字段，0.1.0–0.4.0 携带该字段一律拒绝。0.5.0 允许字段缺失，缺失等效 `false`，但读取不补字段、不升级、不触发存储迁移。

新组件也默认关闭，保持本产品之前的浏览器外观；这不是原版 Widget 的默认值。用户第一次操作开关时，属性和版本升级在一次历史事务中提交；撤销和重做恢复完整快照。现有颜色不变。

Canvas 和 PNG 共用文字布局与绘制：阴影先以深色向右下各偏移一个 GUI px，随后绘制主体文字；继承现有裁切、换行、缩放与字体选择。浏览器效果是近似，不承诺游戏字体像素一致。图形背景、复选框方框和矩形不绘制阴影。

规格和 Prompt 对每个文字节点输出有效的 `textShadow`，包括旧文档缺失字段时的 `false`。例如：`{"type":"minecraft:button","textShadow":true}`。参考实现要求：EditBox 可用 NeoForge `setTextShadow(boolean)`，它控制文字内容、hint、suggestion 与文字光标符号，不控制独立绘制的选择区域或矩形光标；其他四种控件默认有阴影，关闭需要自定义绘制或其他经过验证的实现，不能假称已有通用 setter。证据见 [文字阴影源码审计](../minecraft/TEXT_SHADOW_AUDIT.md)。

旧版应用不能读取 0.5.0；不可静默降级。原始 JSON 继续是唯一权威。PNG、规格和 Prompt 是同一已提交文档及资源、字体代次的派生材料。
