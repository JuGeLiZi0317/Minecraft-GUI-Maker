# H2 创造模式凸起标签页只读审计

审计日期：2026-10-29。目标：Minecraft Java 1.21.1、NeoForge 21.1.244、Java 21。本文是静态源码和本地 JAR 资源核查，不是产品实现授权，也不是游戏实机验证。下面的“确认”仅针对所检查文件；实现建议均须另行选择和授权。

## 证据来源

映射源码根目录：`D:\Minecraft\AIStudio\skills\minecraft-neoforge-dev\api_references`。下表行号均相对于该目录；这是本地映射源码的证据，不能单凭文件路径证明其构建来源或运行时补丁与目标安装完全一致。

| 文件与行号 | 确认证据 |
| --- | --- |
| `net/minecraft/client/gui/screens/inventory/CreativeModeInventoryScreen.java:54-105, 124-133` | Screen 继承容器 Screen；4 组各 7 个 Sprite、26×32 常量、静态 `selectedTab`，面板 195×136，构造依赖玩家及菜单。 |
| 同文件 `:542-546, 559-576, 589-603, 613-713` | 标题依据选中 tab；左键按下消费命中、释放时命中并选择；`selectTab` 修改内容、槽位、搜索框和滚动状态。 |
| 同文件 `:779-805, 840-873` | 先父类渲染，后标签提示；背景阶段先非选中标签、面板及搜索/滚动条，再选中标签及必要的玩家实体。 |
| 同文件 `:875-935` | 位置、点击和悬停区域、按行/选择/列选 Sprite、物品图标位置与绘制。 |
| `net/minecraft/world/item/CreativeModeTab.java:15-76, 90-103, 118-123, 172-173, 193-209, 226-238, 284-297, 453-469` | Tab 是数据对象，图标由 `Supplier<ItemStack>` 提供；有行、列、对齐、背景配置；Row 为 TOP/BOTTOM，Type 为 CATEGORY/INVENTORY/HOTBAR/SEARCH。 |
| `net/neoforged/neoforge/client/gui/CreativeTabsScreenPage.java:20-55` | 当前页按顶部、底部分配并过滤 `shouldDisplay`；实际绘制行列取 page 的 `isTop/getColumn`，包含默认 tab 的特殊列规则。 |
| `net/minecraft/client/gui/screens/inventory/AbstractContainerScreen.java:119-120`；`net/minecraft/client/Minecraft.java:1063, 1329-1333`；`net/minecraft/client/MouseHandler.java:95-96` | 面板以缩放后 GUI 宽高居中；缩放变更触发 resize；鼠标坐标也转换到 GUI 坐标。 |
| 项目 `src/resources/core.ts:145-181`, `src/resources/layered.ts:3-5, 10-15, 52-82` | 客户端资源按路径索引读取、检查版本及 atlas；Sprite 公开解析有白名单、资源层与代次限制。 |
| 项目 `src/domain/schema.ts:45-52, 66, 122-138`；`src/ui/BehaviorPanel.tsx:14-15, 45-60, 80-93` | 当前最高 Schema 0.8.0；事件仅 Button、Checkbox、Rectangle，动作是设置文字、可见性和声明导航；F2 支持有序动作及稳定 ID 引用。 |

## Sprite 与 JAR 核查

只读检查 `C:\Users\JuGeLiZizzz\.gradle\caches\neoformruntime\artifacts\minecraft_1.21.1_client.jar`：大小 26,836,906 字节，SHA-256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`；内部 `version.json` 自报 `id=1.21.1`、资源格式 34。自报版本和哈希仅标识所检查文件，并非来源认证。`assets/minecraft/atlases/gui.json` 为单一 `directory` source：`gui/sprites`，空 prefix。

以下为完整 ID 清单的紧凑表示：每一行的 `{1..7}` 均代表七个独立 ID，前缀均为 `minecraft:container/creative_inventory/`。全部 28 个对应 `assets/minecraft/textures/gui/sprites/container/creative_inventory/<名称>.png` 均存在，PNG 头部均为 26×32，均无同名 `.png.mcmeta`。未将纹理复制到项目或构建产物。

| 行与状态 | 完整 ID 模板 | PNG 内容 SHA-256 前 12 位：列 1 / 2–6 / 7 |
| --- | --- | --- |
| 上、未选中 | `tab_top_unselected_{1..7}` | `45878f87713a` / `45878f87713a` / `45878f87713a` |
| 上、选中 | `tab_top_selected_{1..7}` | `ea11e5bdb736` / `efccd1c21428` / `62533c75a195` |
| 下、未选中 | `tab_bottom_unselected_{1..7}` | `2efa1c9ef17e` / `2efa1c9ef17e` / `2efa1c9ef17e` |
| 下、选中 | `tab_bottom_selected_{1..7}` | `fc59d3afb55e` / `9d18715f4734` / `628c7a286f84` |

因此在这个 JAR 中，选中态左端（1）、中间（2–6）、右端（7）的文件内容各不相同；同一行未选中态七份内容相同。映射源码按当前页零基列索引选择对应序号，并不根据相邻标签动态判断端点。不同资源包可能覆盖这些文件，不能把当前字节相等当成通用资源包合同。

`CreativeModeTab` 暴露 `getTabsImage/withTabsImage`，默认旧式路径是 `textures/gui/container/creative_inventory/tabs.png`；但本次检查的 `renderTabButton` 实际直接使用上述 Sprite 数组，未读取该字段。本 JAR 不含该旧路径的 `tabs.png`。不能据此断言该配置在其他补丁或版本中的作用。

**GUI Maker 能否读取：**底层 `ResourceSession` 可按有效 `assets/` 路径索引和读取，客户端 atlas 结构也符合现有检查；但对外 `LayeredResources.sprite()` 白名单仅含现有 Button、EditBox 和 Checkbox 的 9 个 Sprite，标签 ID 当前返回 `unsupported`。因此“JAR 内可找到”不等于现有组件能解析或绘制；新增支持需要经过白名单、资源层、缓存和 PNG/Canvas 等合同审查。覆盖包 atlas 合并目前不支持；资源代次变化也会使查询失效。没有在网页中加载该 JAR 验证整条路径。

## 几何、图层和状态

以下均为逻辑 GUI 坐标，`L=leftPos`、`T=topPos`、`W=195`、`H=136`，`i=currentPage.getColumn(tab)`：

- 相对 X：普通标签 `27*i`；右对齐标签 `W - 27*(7-i) + 1`。面板按 `(屏幕 GUI 宽-W)/2`、`(屏幕 GUI 高-H)/2` 居中，Java 整数运算。
- **实际 Sprite**：X 为 `L + 相对 X`，上排 Y 为 `T-28`，下排 Y 为 `T+H-4`，大小 26×32。故两排均与面板区域重叠 4 GUI px。
- **点击区域**：X 相对值从 `x` 到 `x+26`，上排 Y 从 `-32` 到 `0`，下排从 `H` 到 `H+32`，源码用双精度 `>=` 和 `<=`，边界包含。它与 Sprite 上下各错开 4 px，不能直接用纹理矩形替代原版命中矩形。
- 提示文字的 hover 测试使用 `(x+3, y+3, 21, 27)`，由 `isHovering` 执行，还应保留其边界语义，不等同点击区域。
- 渲染先画非选中标签（含图标），再画选中标签的背景面板、搜索框与滚动条，最后画选中标签；因此面板可遮住非选中标签交界部分，选中标签位于面板之上。其后容器其余绘制和 tooltip 仍可能影响最终叠层，不能只按组件列表顺序近似。
- 图标在 Sprite 绘制位置的 `(+5,+9)`（上）或 `(+5,+7)`（下），提升 Z 100，调用 `renderItem` 和 `renderItemDecorations`。原版此处要求 `ItemStack`；GUI 物品通常按 16×16 视觉尺度绘制，但实际模型、装饰和视觉边界可能超出，不是静态 PNG 合同。普通自定义 Screen 可以选择其他图标来源，需自行实现。
- 此方法根据选中与上下行选择 Sprite，没有 hover 或键盘 focus 的独立贴图分支；hover 用于显示名称提示。这里没有找到该标签作为标准可聚焦 Widget 的证据，不能据此承诺键盘导航或无障碍行为。
- GUI Scale 改变的是逻辑 GUI 尺寸和到窗口像素的映射；面板位置按缩放后的屏幕重新居中，标签相对面板的 26、32、27 等逻辑尺寸保持不变。窗口取整、实际 DPR 和视觉效果未实机测量。

## 点击与选中调用链

`mouseClicked` 左键遍历当前页可见 tab 并用相对坐标命中，命中即消费；`mouseReleased` 再次独立遍历命中并调用 `selectTab`。所检查方法内没有记录“按下与释放必须在同一 tab”的条件。`selectTab` 更新静态 `selectedTab`，并依类型操作 `ItemPickerMenu` 项目、创造背包/热栏、槽位、搜索、滚动和玩家相关数据；后续 `renderBg` 根据该对象标识绘制。Tab 本身是数据对象，标签点击逻辑位于 Screen，不是标准 Button/Widget。

普通 Screen 可借鉴相对坐标、贴图顺序、命中和显式选中状态；需要开发者自行定义数据、输入分发、互斥选择、目标内容显示及生命周期。创造模式的 Menu、Slot、玩家、搜索和注册表等上下文不能直接作为通用 GUI 标签运行时。现有 Rectangle 的 `GuiGraphics.fill` 仍是视觉绘制，F1 的 `rectangle-click` 是额外交互意图；F2 的 `set-visible` 可依次改变多个目标，但不自动管理标签组或选中外观。

## 适配方案比较

复杂度以本项目首版相对工作量和用户操作成本估计，低/中/高并非工时承诺；支持资源包覆盖、图标、无障碍及完整容器会进一步增加成本。

| 维度 | A 独立视觉组件 | B 现有节点组合 | C 标签页容器 |
| --- | --- | --- | --- |
| Schema 与兼容 | 中：新节点、稳定 ID、选中语义及版本门禁 | 低：沿用现有节点/规则；精确原版贴图当前不可直接表达 | 高：标签、内容归属、状态、删除引用和迁移 |
| Canvas/PNG | 中：共享 Sprite 绘制、层级及状态；图标另计 | 中：近似外观可用既有绘制；精确连接效果困难 | 高：子项布局、裁切、状态、共同导出 |
| 资源解析 | 中：扩展白名单并遵守现有 atlas/覆盖和代次合同 | 低：纯色近似；精确 Sprite 仍需扩展 | 中：复用 A 的资源基础，复杂度不因容器消失 |
| Inspector/编辑体验 | 中：少量位置、样式与选中选项；逐个编辑 | 低开发、高操作负担：多节点叠放，选中/隐藏规则需手工同步 | 高开发、较低重复操作：集中管理组、标签和内容，但需清晰编辑层级 |
| F2 行为 | 中：新事件源和选中状态语义需设计，现有动作不能直接设置标签选中态 | 中：Rectangle 点击和顺序 `set-visible` 可用；需分别维护每组显示/隐藏和视觉状态 | 高：自动互斥与手写动作冲突、顺序和引用需明确 |
| 游戏端 | 中：自行绘制、命中、状态与内容切换；原版物品图标较难 | 中：自定义点击及显示规则，视觉近似；人工映射多节点 | 高：开发组管理与生命周期；交付表达更完整后可能降低下游重复工作 |
| GUI 组 / Blockly | 中：可作为稳定事件源和视觉单元 | 中：现有 ID/事件动作可复用，组语义需要后补 | 高潜力：组与选择语义可复用，但现在定型风险高 |

建议供选择：先评估 **A 的有限原型**，只做上排、明确的选中/未选中视觉、独立点击意图和共享 Canvas/PNG；优先使用用户提供的兼容客户端资源，说明资源不可用时的行为。图标可暂不纳入首版，避免把 ItemStack 模型渲染扩成资源引擎。状态由明确的设计/会话语义表示；若要点击后改变选中外观，必须另行设计动作或标签组状态，不能声称当前 F2 已自动支持。可用既有 F2 `set-visible` 手工切换内容，但不自动互斥。具体 Schema 版本、数据模型、回退显示、删除策略和导出合同留待实现方案确定。B 适合立即验证交互意图但难以精确复刻；C 更适合用户需求稳定后的组级设计。

## 事实、推测与待验证

- **已确认：**上述源码公式、调用链、当前项目 Schema/资源白名单和被检查 JAR 的文件内容；静态源码不等于运行时截图证明。
- **推测/建议：**A 能以较可控的 UI 复杂度验证需求；实际工作量取决于图标、布局、资源覆盖和状态合同。B 的纯色组合只能近似，不代表已实现创造模式原图。
- **未验证：**目标 NeoForge 实机、不同 GUI Scale/DPR、焦点与辅助技术、模组覆盖图集、实际资源包覆盖、物品模型/装饰的边界及其他版本。`withTabsImage` 在其他补丁下的效果也未验证。
- **后续影响：**GUI 组应保留稳定节点/组 ID、显式内容归属及跨 Screen 生命周期；Blockly 将来可以映射稳定事件和有序动作，但需要先定义标签选中、互斥、条件及状态同步。F2 当前没有通用变量、条件或自动容器，不能把这些未来语义当作已经存在。
