# 1.21.1 文字阴影合同

> 下文最后一段描述的是 D-Shadow 之前的状态；现行设计语义见 [D-Shadow 合同](../architecture/D_SHADOW_CONTRACT.md)。

静态源码证据，Minecraft 1.21.1 / NeoForge 21.1.244，源码目录为 `D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/`。这些结论不代表浏览器与游戏像素一致。

| 控件 | 原生默认 | 直接配置能力与定位 |
|---|---|---|
| Button / CycleButton | 带阴影 | `components/AbstractButton.java:30-42` 和 `components/AbstractWidget.java:101-124` 走默认 `drawString` / `drawCenteredString`；未确认有通用阴影 setter。改变需自定义绘制或其他经验证实现。 |
| StringWidget | 带阴影 | `components/StringWidget.java:53-61` 调用无布尔参数 `drawString`；未确认直接切换阴影的 setter。无阴影需自定义文字绘制等实现。 |
| Checkbox | 带阴影 | `components/Checkbox.java:32,97-99` 使用内部 `MultiLineTextWidget`；`components/MultiLineTextWidget.java:64-73` 与 `components/MultiLineLabel.java:80-95` 默认路径带阴影；没有确认公开 Checkbox 阴影开关。 |
| EditBox | 带阴影 | NeoForge 映射 `components/EditBox.java:77,425-471,643-645`：默认 `textShadow=true`，`setTextShadow(boolean)` 可设置。 |

`GuiGraphics.java:453-454,507-508,556-557` 的默认 `drawString` 重载传入 `true`；带布尔值重载允许调用方指定阴影，不能把该绘制函数能力等同于每个 Widget 自带开关。

当前 GUI Schema 不含阴影字段；未指定时交由游戏实现采用控件默认。浏览器画布与参考 PNG 当前不绘制文字阴影。此前无阴影的普通面板文字只在网页近似中体现，JSON 不能表达该意图，开发者若要游戏中无阴影必须明确选择自定义实现。未来如允许用户选择，应先制定版本化合同，区分 EditBox 的 NeoForge 直接设置与其他控件的自定义实现，不得将前端近似当作已验证的原版设置。
