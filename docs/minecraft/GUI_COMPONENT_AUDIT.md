# Minecraft / NeoForge GUI 组件源码审计

审计日期：2026-10-27。最终目标：**Minecraft Java Edition 1.21.1 + NeoForge 21.1.244 + Java 21**。这是源码静态审计，不是游戏内运行或像素比对报告。

## 版本及证据等级

主要源码根目录（下文 `API/`）：`D:\Minecraft\AIStudio\skills\minecraft-neoforge-dev\api_references`。文档根目录（`DOC/`）：`D:\Minecraft\AIStudio\skills\minecraft-neoforge-dev\docs`。`MC/` = `API/net/minecraft/client/gui/`，`NF/` = `API/net/neoforged/neoforge/client/`。文件定位均指本地源码；末尾索引提供绝对路径、行号和指纹，不分发源码本体。

选择 21.1.244 是为了与现存开发模板和可用本地源码一致，不宣称它是最新版本。

| 证据 | 结论 |
|---|---|
| `D:\Minecraft\AIStudio\templates\neoforge-1.21.1-template\gradle.properties:11–22` | minecraft_version=1.21.1，neo_version=21.1.244，Parchment 2024.11.17 |
| 同模板 `build.gradle:39–43` | Java toolchain 21，NeoForge 使用 project.neo_version |
| Gradle 缓存 `net.neoforged/neoforge/21.1.244/.../neoforge-21.1.244-moddev-config.json` | NeoForm 坐标为 `1.21.1-20240808.144430`，sources 与 universal 坐标均为 21.1.244 |
| 缓存 `neoforge-21.1.244-sources.jar` | SHA-256：`3d46a2b339ff378959536640113b1eee289e113901dfb191ac5b113e63ea3228` |
| 将 API 中 NF widget 目录全部 7 个 Java 文件及两项 extension、ScreenEvent/ContainerScreenEvent/RegisterDimensionTransitionScreenEvent 与该 jar 比较 | 12 项在统一 CRLF/LF 后内容一致；其中 package-info 不是组件 |
| NeoFormRuntime `sourcesAndCompiledWithNeoForge_d268a859068c3807afd66dd2c4895b50bcd0e35d_output.jar` | API 中 components 顶层 51 个 Java 文件，加 GuiGraphics、Screen、BeaconScreen、AbstractFurnaceScreen、Slot，共 56 项统一行尾后内容全部一致 |

以上运行时缓存位于 `C:\Users\JuGeLiZizzz\.gradle\caches\neoformruntime\intermediate_results`。版本链可以本地复核：`sourcesAndCompiledWithNeoForge_d268…txt` → `sourcesWithNeoForge_b5e456a1840b8886dbb9ea0857da9888a282fb74.txt`（注入 21.1.244 sources.jar）→ `transformSources_8679b566b06ea6450997322aa1be2cd5b4e70eb9.txt`（Minecraft 1.21.1 manifest、21.1.244 userdev、Parchment）→ `applyNeoforgePatches_e0bfb4664cabe942a85a54412b4c76e5aa7a8179.txt`（21.1.244 userdev patches）。

该缓存来自 customdim 环境，额外 AT 文件只开放 `net.minecraft.server.MinecraftServer storageSource`，没有 GUI 项。本次一致性结论限定于已比较文件，不为整个 API 目录签发版本证明，也不把 NeoForge 补丁添加的成员说成纯原版 API。

证据标签：**S** = 本地源码静态确认且在上述版本比对范围内；**D** = 本地文档概念说明；**P** = 产品设计建议；**U** = 未完成验证。所有候选的游戏内视觉、资源包及可访问性行为仍为 U；S 不等于已运行。

## Screen、绘制和输入基础

- **S** `net.minecraft.client.gui.screens.Screen` 为抽象界面基类，构造参数为 Component title。`render` 在本地版本先调用 `renderBackground(graphics, mouseX, mouseY, partialTick)`，再遍历 renderables；标题不会因此自动画出。`addRenderableWidget` 同时加入渲染/事件/旁白，`addRenderableOnly` 只渲染，`addWidget` 加入事件/旁白但不绘制。`resize` 走 repositionElements，默认 rebuildWidgets，因此不能把绝对窗口尺寸当作永久坐标。
- **S** `net.minecraft.client.gui.components.AbstractWidget` 是抽象基类；构造参数 x/y/width/height/message，状态 active、visible、alpha、focus、tooltip。render 的可见门控与点击的 active+visible 门控不同；禁用不等于隐藏。左右/上下边界按源码命中规则，设计器统一半开区域 `[x,x+w) × [y,y+h)`。
- **S** `AbstractWidget` 在 NeoForge 补丁环境实现 `IAbstractWidgetExtension`；带鼠标 button 参数的 onClick 转发、FGColor 等不可不加区分地宣传为纯原版 API。
- **S** `AbstractButton` 提供按键激活到 onPress 的通道；EditBox 等有独立输入逻辑。不能把浏览器每个 pointerdown 都等价为 Minecraft onPress。
- **D** `DOC/gui/screens.md` 解释 GUI scale、Renderable、GuiEventListener、焦点和旁白。概念可用，示例不是签名权威。

## 1. 原版独立 Widget（在锁定 NeoForge 环境中的原版类）

下表 `components/X.java` 均相对于 MC/；准确包名前缀为 **`net.minecraft.client.gui.components.`**。属性是可表达的规格，不代表每项均有同名 Java setter。通用状态继承上节，但声明为装饰用途的节点不导出伪造业务事件。

| 类型 / 准确类名后缀 | 构造与可配置项 | 事件与状态 | 限制、尺寸及建议 | 源码定位（S） |
|---|---|---|---|---|
| 普通按钮 `Button` | builder(message, OnPress)，pos/size/bounds/tooltip；文本、位置、尺寸、旁白 | OnPress.onPress(Button)，active/visible/hover/focus | 默认 150×20，宽有 120/150/200 常量；并非只能 20 高；长字滚动由父类渲染决定。首批 | components/Button.java:12,22,55；AbstractButton.java |
| 图片按钮 `ImageButton` | x/y/w/h、WidgetSprites、OnPress、可选 message | 与按钮相同；根据 active 与 hover/focus 选 sprite | 需要资源 ID 与状态资源映射，不是普通图片。延后资源闭环后加入 | components/ImageButton.java:12–37；WidgetSprites.java |
| 单行输入 `EditBox` | Font,x/y/w/h,message；value、maxLength、bordered、editable、颜色、hint、suggestion、textShadow、filter | setResponder(Consumer<String>)；键盘/字符/选区/剪贴板；输入须 active、focused、editable | 默认 maxLength=32；message 是叙述标签而非输入值；filter/formatter 为 Java 函数，规格只允许受限声明，不能序列化闭包。首批 | components/EditBox.java:79–99,112–143,382,509–647 |
| 复选框 `Checkbox` | builder(message,Font)，pos、maxWidth、selected、tooltip、onValueChange | onPress 翻转 selected 并调用 OnValueChange | 尺寸依赖 Font 和文字；框 getBoxSize=17，宽度上限 maxWidth，整体高度依赖文字，不应任意拉伸。无通用公开 setSelected；首批后加入 | components/Checkbox.java:29–64,103–169 |
| 循环选择 `CycleButton<T>` | builder(valueStringifier)，非空 values、initialValue、tooltip、displayOnlyValue；create(x/y/w/h/name/callback) | OnValueChange；点击/Shift反向/滚轮循环；setValue 不等同用户回调 | **不是下拉菜单**；任意 T、函数、OptionInstance 不能直接进 JSON；V1 值缩小到字符串枚举。延后 | components/CycleButton.java:68–125,152–268 |
| 单行标签 `StringWidget` | Component、Font；可指定 x/y/w/h；setColor，alignLeft/Center/Right | 无业务回调，按装饰节点使用 | 是 Widget；不是 drawString 别名。默认尺寸按字体；显式小宽度会省略截断；不把点击当业务事件。首批 | components/StringWidget.java:17–68；AbstractStringWidget.java |
| 多行标签 `MultiLineTextWidget` | Component、Font、x/y；maxWidth/maxRows/centered/color | 无业务回调 | getWidth/getHeight 按 MultiLineLabel 测量派生，不能自由设定两轴后声称保持原生换行。延后 | components/MultiLineTextWidget.java:19–66 |
| 多行输入 `MultiLineEditBox` | Font,x/y/w/h,placeholder,message；characterLimit、value | setValueListener(Consumer<String>)；键鼠选区、换行和滚动 | 继承 AbstractScrollWidget；不是 EditBox 的 multiline 标志。需要独立预览与输入审计。延后 | components/MultiLineEditBox.java:29–49,59–116,217–227 |
| 图片 `ImageWidget` | 抽象类，**通过 texture(w,h,resource,textureW,textureH) 或 sprite(w,h,resource) 工厂使用**；再设位置 | 不提供业务回调；isActive=false，nextFocusPath=null | 不能 new 抽象基类；Texture 实现以自身尺寸作为绘制区域/采样参数，不能假定任意缩放整图。和 GuiGraphics 绘制图片应分类型 | components/ImageWidget.java:16–96 |
| 状态图片按钮 `StateSwitchingButton` | x/y/w/h/initialState；initTextureValues、setStateTriggered | 状态 getter/setter；基类命中不自动产生切换业务 | **没有内建 onPress 回调或自动切换**；更像状态渲染器，sprites=null 不画；需要 Screen/子类补业务。非首批 | components/StateSwitchingButton.java:15–53 |

补充候选 **`net.minecraft.client.gui.components.TabButton`**：public 顶层 Widget，构造为 TabManager、Tab、width、height（MC/components/TabButton.java:19,34，S）。它属于原版 Widget，但需要 Tab/TabManager 配套，不在内部专用类别；没有通用 OnPress 构造回调，不能按普通按钮处理，也不纳入首批。

## 2. 原版绘制元素（不是独立 Widget）

准确类：**`net.minecraft.client.gui.GuiGraphics`**，下列为方法能力；没有组件构造、内建焦点或业务回调。编辑器可以把它们建模为节点，但来源必须标记 `vanilla-draw`。

| 规格元素 | 已确认绘制入口 / 可配属性 | 交互与限制 | 源码定位（S） |
|---|---|---|---|
| 线/矩形/渐变/边框 | hLine、vLine、fill、fillGradient、renderOutline；坐标、尺寸、ARGB、渐变上下色 | 无事件；hLine/vLine 端点规则与 fill 不完全相同，适配时转换；矩形首批 | MC/GuiGraphics.java:139–392,670 |
| 文本 | drawString、drawCenteredString、drawWordWrap；Font、Component/String、坐标、color、shadow、wrapWidth | 无事件；Component 翻译、双向排版和字体资源不能以浏览器字体宽度替代确认 | MC/GuiGraphics.java:411–593 |
| 贴图 / GUI sprite | blit、blitSprite；ResourceLocation、UV、源图尺寸、目标区域 | 无事件；texture 与 sprite 路径语义不同，sprite 支持 stretch/tile/nine-slice 元数据，不应统一假定拉伸 | MC/GuiGraphics.java:677–885；DOC/gui/screens.md 的 blitSprite 节 |
| 裁剪区域 | enableScissor/disableScissor；矩形 | 无回调，不是滚动容器；调用有栈和坐标转换责任 | MC/GuiGraphics.java:201–240 |
| 物品图标与装饰 | renderItem/renderFakeItem/renderItemDecorations；ItemStack、位置、seed、覆盖文字 | 需真实游戏资源/模型和物品数据；网页只能占位/用户参考图，不等于可交互槽位 | MC/GuiGraphics.java:1196–1334 |
| Tooltip | renderTooltip/renderComponentTooltip，或 AbstractWidget.setTooltip；文本、位置、延迟 | 绘制方法本身不负责所有 hover 判断；不是可独立拖放的按钮 | MC/GuiGraphics.java:1377 起；components/AbstractWidget.java:78–87 |

## 3. NeoForge 组件或扩展

准确前缀 **`net.neoforged.neoforge.client.`**。以下均为 S；NF 类不能标记 vanilla-widget。

| 准确类名后缀 | 构造/属性 | 事件与限制 | 源码定位 |
|---|---|---|---|
| `gui.widget.ExtendedButton` | 公共 x/y/w/h/Component/OnPress，可选 CreateNarration 或 Builder | 按钮回调；重新实现按钮背景/文字绘制，不是新的通用布局系统 | NF/gui/widget/ExtendedButton.java:25–42 |
| `gui.widget.UnicodeGlyphButton` | ExtendedButton 参数 + glyph 字符串、glyphScale | OnPress；字体覆盖和字符实际宽度决定表现，不能当通用图标资源系统 | NF/gui/widget/UnicodeGlyphButton.java:17–28 |
| `gui.widget.ExtendedSlider` | x/y/w/h、prefix/suffix、min/max/current、stepSize、precision、drawString；get/setValue | 继承抽象 slider 并实现 applyValue，但默认为空；**没有构造回调**，通知须子类 override 或外部读取。支持取整步进；width>8、min<max 为本项目约束；步进以数值的零点倍数取整，不能假定 min+n*step | NF/gui/widget/ExtendedSlider.java:23,51–117,133–198 |
| `gui.widget.ScrollPanel` | 抽象；Minecraft、w/h/top/left，可选 border/barWidth/颜色 | 必须实现 getContentHeight/drawPanel；滚动和 clickPanel 可扩展；children() 返回空列表，**不是自动包含/路由任意子 Widget 的容器** | NF/gui/widget/ScrollPanel.java:28,54–132,157–225,295 |
| `extensions.IGuiGraphicsExtension` | drawScrollingString、blitWithBorder、blitInscribed 等默认方法 | 绘制扩展，不是可实例化 Widget；文件中注释掉的 blitNineSlicedSized 不可列为可用 API | NF/extensions/IGuiGraphicsExtension.java:17–169 |
| `extensions.IAbstractWidgetExtension` | onClick(mouseX,mouseY,button) 默认转发旧 onClick | 扩展输入接口，不是全局积木事件总线 | NF/extensions/IAbstractWidgetExtension.java:13–39 |
| `event.ScreenEvent` | Init、Render、鼠标/按键/字符、Opening、Closing 等事件子类 | 生命周期钩子；Pre/Post 的可取消性应逐类检查，不能概括为都能取消；不是视觉组件 | NF/event/ScreenEvent.java:75,154,367,801,978,1025 |

`gui.widget.ModListWidget` 和 `ModsButton` 虽然属于 NeoForge，但分别耦合 ModListScreen 与模组更新信息；它们不作为通用调色板候选。来源分类仍为 NeoForge，额外标记用途受限。

## 4. 特定游戏界面内部专用 Widget

| 准确类 / 来源 | 属性与交互 | 限制 / 决策 | 源码（S） |
|---|---|---|---|
| `net.minecraft.client.gui.screens.inventory.BeaconScreen.BeaconPowerButton` 及 BeaconConfirmButton/BeaconCancelButton | 与信标状态、效果、确认/取消相关 | 非通用公开独立组件，含非 public 内部类、外层状态依赖；不能作为“原生通用确认按钮”暴露 | MC/screens/inventory/BeaconScreen.java:164,180,200,254,299,314 |

Beacon 的案例确认“游戏里看得到”不等于“可独立使用”。本次没有审遍所有屏幕的内部类；搜索存在只形成候选，不是通用支持清单。

## 5. 需要自定义实现或组合的规格

| 规格概念 | 可以依赖的原生基础 | 仍需实现的部分 / 分类 | 证据 |
|---|---|---|---|
| 滑块（纯原版方案） | `net.minecraft.client.gui.components.AbstractSliderButton` | 抽象类，需 updateMessage/applyValue 子类；value 归一化 0..1，width-8 参与计算；不是可直接 new 的 Slider。归 custom，列原生 baseClass | MC/components/AbstractSliderButton.java:21,33,139–179（S） |
| 通用列表 | AbstractSelectionList / ObjectSelectionList / ContainerObjectSelectionList | 抽象列表和 Entry 需要渲染/旁白/输入实现；不能把任意 JSON children 自动当原生 Entry。归 custom，标原生基础 | MC/components/AbstractSelectionList.java:29,48,103；对应两个子类（S） |
| 下拉菜单、单选组、通用开关、树、可折叠面板 | Button/Checkbox/CycleButton/绘制方法可组合 | 本次未确认锁定版本有对应通用独立 Widget；归 custom 候选，**不声称整个游戏绝不存在**。不把 CycleButton 当 select | components 目录及上表（S 的搜索范围，通用 API 判断为 P） |
| 炉火、进度条 | AbstractFurnaceScreen 调用 GuiGraphics.blitSprite 部分裁剪 | 进度数据绑定、方向、范围、资源和刷新由实现者完成；“熔炉有进度”不等于通用 ProgressBar Widget | MC/screens/inventory/AbstractFurnaceScreen.java:24–40,94–99（S） |
| 物品槽位 / 背包 | `net.minecraft.world.inventory.Slot` + AbstractContainerScreen + Menu | Slot 构造需要 Container/index/x/y；不是 AbstractWidget。物品交换、权限、同步、服务器校验不能由 GUI 规格自动实现 | API/net/minecraft/world/inventory/Slot.java:11,18；DOC/gui/menus.md（S/D） |

## 本地文档差异及能力边界

`DOC/gui/screens.md` 的示例有 `renderBackground(graphics)`，而锁定源码的 Screen 提供四参数版本；文档称 base render 只画 widgets，但当前源码包含背景调用。文档“tick every frame”措辞也不能用来推断帧率定时语义。使用本地文档理解概念，实施签名和顺序按 API/ 源码核验，禁止照抄这些示例。

首个最小编辑器只建议 Button、EditBox、StringWidget 和 fill 矩形（P）。Checkbox、CycleButton 加入前必须落实派生尺寸和语义事件；资源型 Widget、滑块、列表、容器和自定义控件后置。组件属性目录必须明确自由尺寸、派生尺寸、只读状态及实现要求，不暴露一套假装所有 Widget 都通用的属性面板。

本阶段未运行 Java 编译、runClient、GUI scale/语言/资源包矩阵和网页渲染。未搜索网上 Minecraft 代码、未用未锁版本代码填补缺口、未复制游戏资产。后续像素保真需要本地合法资源与锁定环境中的人工或专门测试；默认近似皮肤仍可完成规格闭环。

## 源码定位与审计指纹索引

指纹为审计当日本地文件原始字节 SHA-256；前文 jar 对比只统一行尾，因此指纹不能直接与 jar entry 的字节散列混用。链接定位到顶层声明行，表内成员行号可进一步查找。只保存元数据，不复制源码。

| 文件（点击打开本地证据） | 声明行 | SHA-256 |
|---|---|---|
| [net/minecraft/client/gui/screens/Screen.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/screens/Screen.java:58) | 58 | `73160d2f2a2ea4cc6903ad23cd6af175f9509f5f3dd72448142fa3792000e568` |
| [net/minecraft/client/gui/GuiGraphics.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/GuiGraphics.java:59) | 59 | `9779101356074e82d4ad63a0c0dff721aa7ae33613d96b7c4fb254e6b2494645` |
| [net/minecraft/client/gui/components/AbstractWidget.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/AbstractWidget.java:28) | 28 | `bdc3db4a8cf3e91b5720c05f8fcd461ddc665bfb0fc9cfe745898227f80eddcb` |
| [net/minecraft/client/gui/components/AbstractButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/AbstractButton.java:15) | 15 | `c3068afab9ea69c099288c5b2691a9962e7d5e84736e812ce84c971526ed6ffa` |
| [net/minecraft/client/gui/components/Button.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/Button.java:12) | 12 | `cd30365aaaa70fe3333c258c0aba03e058cc89f03dfa82483f10e7f8a228c8c6` |
| [net/minecraft/client/gui/components/ImageButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/ImageButton.java:11) | 11 | `a512a6d0ec607dd44172f08b13cb86361e1f869a1315c704b79ef6f6d1a2fd0f` |
| [net/minecraft/client/gui/components/WidgetSprites.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/WidgetSprites.java:8) | 8 | `25b7f26faf8e90941cbcd933033a6ef04e7fe25c8af6f3d28b47b4bc4f000cb1` |
| [net/minecraft/client/gui/components/EditBox.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/EditBox.java:28) | 28 | `85d1d46e5d34a632c9f11f226758bbebe8ff3f6c8333acd44ece29422cee02e6` |
| [net/minecraft/client/gui/components/Checkbox.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/Checkbox.java:17) | 17 | `930a95d57d412a690cd9d33159da2a136bc94e0ae1275bc3bafacf5e3e25f405` |
| [net/minecraft/client/gui/components/CycleButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/CycleButton.java:21) | 21 | `e19857bd17c7b76816bc9f463cbc38d37f681790f3816d44781b4f294d5b6e99` |
| [net/minecraft/client/gui/components/StringWidget.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/StringWidget.java:14) | 14 | `514145560118b4fa7fc3cae8a1077c72c1ea8b937f55fd42f7d2a6f4bd34f415` |
| [net/minecraft/client/gui/components/AbstractStringWidget.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/AbstractStringWidget.java:10) | 10 | `adfd92ef7192ef46539e2ada80f873a487053fc7f571d035c4b69de32da9fe8b` |
| [net/minecraft/client/gui/components/MultiLineTextWidget.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/MultiLineTextWidget.java:13) | 13 | `8edda882dc5a2238ccc0bd4bc6bf8d80b23b74e426f40e3bbf039c406f64ed6c` |
| [net/minecraft/client/gui/components/MultiLineEditBox.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/MultiLineEditBox.java:17) | 17 | `cf9346feaf4579e68badeca82bf2bd99e0559ce64a11a29ceb6fbffb8469d26c` |
| [net/minecraft/client/gui/components/ImageWidget.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/ImageWidget.java:15) | 15 | `10989b02bb78dcd82a7b5e989dd3f3180cd265113f7f67ced849852927d228c1` |
| [net/minecraft/client/gui/components/StateSwitchingButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/StateSwitchingButton.java:12) | 12 | `a14fabab7427c63e79a4fe52206c82b0e6a087cec7cce103b5ab6635d2293fbb` |
| [net/minecraft/client/gui/components/AbstractSliderButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/AbstractSliderButton.java:19) | 19 | `802f5058635fc1a4d62aacc0729cbfd1361f8186b8172ad5f1d90a6b56a2af7d` |
| [net/minecraft/client/gui/components/AbstractSelectionList.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/AbstractSelectionList.java:29) | 29 | `5185c088fec2e506f58acbf8922e948a52f743c6f7803e29f79fee06b2a8e73c` |
| [net/minecraft/client/gui/components/ObjectSelectionList.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/ObjectSelectionList.java:15) | 15 | `d9ba56e1941a66d8eb27de0d51199312f032b4f698f65b43f9ba9004e4a4aea8` |
| [net/minecraft/client/gui/components/ContainerObjectSelectionList.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/ContainerObjectSelectionList.java:22) | 22 | `d8e3199ad8f498aae95f0351b4e4f57e9bb6b9d4fa56c812ce0dc715337adb59` |
| [net/minecraft/client/gui/components/TabButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/components/TabButton.java:19) | 19 | `83ca3272119af71dcd4c8002b24e673dcf2e34f5870b8cfe843df8bc2fe4f409` |
| [net/neoforged/neoforge/client/gui/widget/ExtendedButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/gui/widget/ExtendedButton.java:25) | 25 | `299184b2fab2ce9d8943fb1ae55b15f713649797fd2e0936c04a7568112d09c5` |
| [net/neoforged/neoforge/client/gui/widget/UnicodeGlyphButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/gui/widget/UnicodeGlyphButton.java:17) | 17 | `c6533a2ee23e8dba71635b81e70f9c634e905c6dff517415c8cbbc07496a8676` |
| [net/neoforged/neoforge/client/gui/widget/ExtendedSlider.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/gui/widget/ExtendedSlider.java:23) | 23 | `958b85b43bcc606ff79076fd9b7bedb5bcdeb786495369d7b941f51bfa2e4cd8` |
| [net/neoforged/neoforge/client/gui/widget/ScrollPanel.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/gui/widget/ScrollPanel.java:28) | 28 | `38de931cdc19fe52cc792be40ce652cab19de69336af3467f000d860d8a2a99e` |
| [net/neoforged/neoforge/client/gui/widget/ModsButton.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/gui/widget/ModsButton.java:22) | 22 | `5f504707310476a2177db119723cbe7a5dc7c1f8d53dec6bd8a483aedc2352ba` |
| [net/neoforged/neoforge/client/gui/widget/ModListWidget.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/gui/widget/ModListWidget.java:23) | 23 | `68fd478306e10a61826f3314e715eaecedd0ad7804180e6f21a6f3c164546954` |
| [net/neoforged/neoforge/client/extensions/IGuiGraphicsExtension.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/extensions/IGuiGraphicsExtension.java:17) | 17 | `d9d2838c8a91c89bf9d518568b86a57676c553cc47fd86b5b1f05524f53fc5ec` |
| [net/neoforged/neoforge/client/extensions/IAbstractWidgetExtension.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/extensions/IAbstractWidgetExtension.java:13) | 13 | `e6635491e71c16236116ee92a0e08fff537274256f5206f692990c5d5c7603e4` |
| [net/neoforged/neoforge/client/event/ScreenEvent.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/neoforged/neoforge/client/event/ScreenEvent.java:49) | 49 | `2065efde1af16c36ab48829f6a7ace39e7ee9b51fc34c72aa12688684e5cf34c` |
| [net/minecraft/client/gui/screens/inventory/BeaconScreen.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/screens/inventory/BeaconScreen.java:32) | 32 | `5512ed48ff48745f3cacd1b955ec880e335b9ebf653a73f131df82ad44aad1ff` |
| [net/minecraft/client/gui/screens/inventory/AbstractFurnaceScreen.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/client/gui/screens/inventory/AbstractFurnaceScreen.java:20) | 20 | `b549cb00d66c399ee78f3c46af38f4a8bd6e61e500ffda1e1cbdf0544b2b0988` |
| [net/minecraft/world/inventory/Slot.java](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/world/inventory/Slot.java:11) | 11 | `382a5680eef82455be094b4a0b79e0b910f464959b2fd7e4ca6a9f8fb19fb69f` |

文档入口：[本地 Screens](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/docs/gui/screens.md)、[本地 Menus](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/docs/gui/menus.md)。本地副本未附文档仓库固定提交/准确采集版本，本次只用作 D 类概念证据，不据此断言构建级 API；准确签名以 S 类源码为准。
