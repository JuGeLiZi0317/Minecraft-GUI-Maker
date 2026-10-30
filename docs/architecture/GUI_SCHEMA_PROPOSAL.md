# 最小 GUI Schema 提案

日期：2026-10-27。状态：**提案，尚未实现验证器**。Schema `0.1.0`；目标 Minecraft 1.21.1 / NeoForge 21.1.244 / Java 21。模型描述意图与实现约束，不存 React element、Konva 节点、Java lambda、Blockly workspace 或可执行脚本。

## 可携带项目

单一权威文档 `project.json`，可以独立导入导出。V1 最小版本仅一个 Screen；数据使用 screens 数组，校验长度恰为 1，不预建跨屏路由系统。有资源时可交付 ZIP：

```text
project.json                 # 完整、可再次编辑的权威内容
assets/<assetId>.png          # 用户提供且可携带的资源，可选
references/<screenId>.png     # 派生参考图，不作为编辑数据
implementation-prompt.md     # 派生实现规格
```

PNG 与 Prompt 头部标明 projectId、revision、Schema/目标版本和近似预览性质。ZIP 文件列表可由结构约定确定，V1 不单独维护第二份 manifest。JSON 可含未提供的 Minecraft ResourceLocation，导入后显示缺失资源占位，保留 ID 与说明；不能假定资源存在就自动从游戏分发资产。

## 字段合同

| 字段 | 约束与语义 |
|---|---|
| format / schemaVersion | 固定 `minecraft-gui-maker` / `0.1.0`；文档格式版本不同于应用版本、组件目录版本 |
| target | edition=`java`、minecraft=`1.21.1`、loader={id:`neoforge`,version:`21.1.244`}、java=21；不允许范围字符串静默漂移 |
| catalogVersion | `mc-1.21.1-neoforge-21.1.244-audit-1`，约束类型与来源；导入时由本地目录校验，外部 JSON 不能自行声称“原生已确认” |
| project | id、name、revision（非负整数）；revision 是快照标识，保存竞争使用仓储元数据，不要求跨副本全局唯一 |
| screens[] | id、title（TextSpec）、base=`screen`、designSize、placement、background、nodes、variables、behaviors。V1 不支持 menu/container screen 的可运行行为 |
| designSize | 正整数 width/height，单位 `gui-px`；参考设计区大小，不是固定物理窗口分辨率。placement=`center` 表示在运行时 GUI 逻辑 viewport 居中 |
| nodes[] | id、type（语义目录 ID）、source、bounds、state、props、events。数组顺序为绘制后到前顺序；V1 不另设 zIndex，避免冲突 |
| bounds | 整数 x/y/w/h，屏幕设计区左上角为原点，w/h>0；无缩放/旋转。V1 要求在设计区内；超边界导入报错而非偷偷移动 |
| state | visible、enabled 布尔初值；非交互绘制节点 enabled 不适用，省略。hover/focus 是预览会话状态，不能持久化 |
| props | 按 type 的封闭联合类型；只接收本类型字段，不接受任意 Java 属性字典 |
| source | category、className、可选 member/baseClass。五类为 vanilla-widget、vanilla-draw、neoforge、screen-internal、custom；由目录检查映射一致性 |
| events | 事件名→behaviorId 的字典；只接受目录为本 type 公布的语义事件，例如 press、valueChanged；不是每个节点都能带 click |
| variables | id、type（boolean/string/number）、initial；屏幕局部，可序列化；不含表达式函数和游戏对象引用 |
| behaviors | id、steps；结构化受限动作 AST，只有声明性规格，不包含 Java/JS 源码 |
| assets[] | id、kind=`image`、path、mediaType、width/height、sha256、rightsNote；仅用户 PNG；ResourceLocation 与本地 assetId 用独立字段关联 |
| extensions | 可选、按反向域名命名的 JSON 对象；未知扩展原样保留但不执行。未知核心字段报错，不用静默 strip 掩盖损失 |

source 例：Button 为 `vanilla-widget` + `net.minecraft.client.gui.components.Button`；fill 为 `vanilla-draw` + `net.minecraft.client.gui.GuiGraphics` + member=`fill`；NeoForge ExtendedSlider 为 `neoforge`；原版抽象 slider 的项目实现为 `custom`，用 baseClass 标记 AbstractSliderButton。来源名与可直接实例化性不是一回事，目录还要提供 construction=`builder|constructor|factory|abstract|internal|draw`。

位置换算：运行时 offsetX=floor((viewportWidth-designWidth)/2)，offsetY 同理，实际位置 offset+bounds；网页视图 pan/zoom/DPR 不导出。小于设计区的窗口将产生超出区域，实现 Prompt 必须提示该限制，V1 不声称自动响应式适配。

## 最小类型与约束

| type | props | 事件 | 尺寸策略 |
|---|---|---|---|
| minecraft:button | message:TextSpec；可选 tooltip:TextSpec | press | 自由整数，默认 150×20；本项目不开放小于 9×9 的按钮，这是编辑器策略而非 API 禁止 |
| minecraft:edit-box | narration:TextSpec,value:string,maxLength:int≥0,hint?:TextSpec,bordered:boolean,editable:boolean | valueChanged | 自由整数，建议最低 12×12；maxLength 默认32，value不得超限；UTF-16 长度按目标 Java API 语义处理 |
| minecraft:string-widget | text:TextSpec,color:`#AARRGGBB`,align:left/center/right | 无 | 显式边界，网页近似文本宽度，溢出预览应反映截断，不硬称精确 |
| minecraft:fill | color:`#AARRGGBB` | 无 | 自由整数矩形，enabled 不适用 |

后续 Checkbox 使用 maxWidth/selected，bounds 尺寸为派生预览，不可自由拉伸；应在引入类型时添加 `sizePolicy` 与测量合同，不能现在用猜测字体强行定死。CycleButton 用非空 options[{value:string,label:TextSpec}]、value∈options，事件 valueChanged。它们不是本次最小可运行任务的前置条件。

TextSpec 只支持 `{kind:"literal",value:string}` 或 `{kind:"translate",key:string,fallback:string}`，先不支持任意 Minecraft Component 树、点击 URL 和复杂样式。颜色固定 ARGB 字符串以避免 JS 有符号位运算歧义。Tooltip 是节点属性，作为派生悬浮显示，不另造独立交互节点。

## 行为 AST

首个编辑器可使用空 behaviors/events；后续事件表单与 Blockly 共同映射到以下合同，不以 Blockly JSON 作为项目权威行为。

- `setVariable`：variableId、value:Expr；不访问任意对象路径。
- `setNodeState`：nodeId、property=`visible|enabled`、value:boolean Expr；属性必须适用于目标节点。
- `if`：condition:Expr、then:Step[]、else:Step[]。
- `closeScreen`：无参数；描述客户端关闭意图。
- `implementationNote`：text、side=`client|server|both`；给开发者的待实现要求，预览只展示提示，绝不当作完成的网络或权限逻辑。

Expr 仅 `literal(value)`、`variable(id)`、`eventValue`、`equals(left,right)`、`not(value)`。布尔/数值/字符串严格类型检查，eventValue 只在 valueChanged 可用，类型由事件源决定。Step[] 顺序执行；一次事件在预览副本上同步执行，动作产生的状态更新不再次触发业务事件。无循环、递归、外部 IO、eval、定时器。服务端数据、命令、物品交换只作为 implementationNote，必须在 Prompt 标记需要开发者实现服务端验证。

定义上限（产品安全/稳定性策略，非 Minecraft 限制）：JSON≤5 MiB、节点≤1000、行为≤500、AST 深度≤16、单事件≤1000步（含分支累计）；ZIP 解压总量≤50 MiB，PNG 单图≤4096×4096。上限应可在后续实测后版本化调整。

## 完整可序列化示例

以下 JSON 是文档样例，没有创建应用或 Schema 代码。button 的 press 关闭 Screen；fill 没有交互事件。

```json
{
  "format": "minecraft-gui-maker",
  "schemaVersion": "0.1.0",
  "catalogVersion": "mc-1.21.1-neoforge-21.1.244-audit-1",
  "target": {
    "edition": "java",
    "minecraft": "1.21.1",
    "loader": { "id": "neoforge", "version": "21.1.244" },
    "java": 21
  },
  "project": { "id": "project_demo", "name": "示例界面", "revision": 1 },
  "screens": [{
    "id": "screen_main",
    "title": { "kind": "literal", "value": "示例" },
    "base": "screen",
    "designSize": { "width": 320, "height": 180, "unit": "gui-px" },
    "placement": "center",
    "background": { "kind": "none" },
    "nodes": [{
      "id": "panel",
      "type": "minecraft:fill",
      "source": {
        "category": "vanilla-draw",
        "className": "net.minecraft.client.gui.GuiGraphics",
        "member": "fill"
      },
      "bounds": { "x": 20, "y": 20, "w": 280, "h": 140 },
      "state": { "visible": true },
      "props": { "color": "#FF202020" },
      "events": {}
    }, {
      "id": "button_close",
      "type": "minecraft:button",
      "source": {
        "category": "vanilla-widget",
        "className": "net.minecraft.client.gui.components.Button"
      },
      "bounds": { "x": 85, "y": 130, "w": 150, "h": 20 },
      "state": { "visible": true, "enabled": true },
      "props": { "message": { "kind": "literal", "value": "关闭" } },
      "events": { "press": "behavior_close" }
    }],
    "variables": [],
    "behaviors": [{ "id": "behavior_close", "steps": [{ "op": "closeScreen" }] }]
  }],
  "assets": []
}
```

## 导入、迁移和往返

先按字节数限制读取，解析 JSON 为 unknown；校验 format/version，再校验 Zod 类型分支，最后做唯一 ID、引用、事件与类型语义检查。全项目 Screen/node/variable/behavior/asset ID 必须唯一且符合 `[A-Za-z][A-Za-z0-9_-]{0,63}`；无效文件不能写入活动 store 或 IndexedDB。显示字段路径和错误原因，不自动修复成不同设计。

未知核心 type/category/行为 op 或未来 Schema 版本：拒绝作为可编辑文档导入，允许用户保留原文件；不能降级为 Button 或丢掉行为后提示成功。资产缺失属于诊断警告，可导入但标记未解析，导出 Prompt 必须包含它。外部 source 必须与受信任目录匹配；custom 类型本版不开放任意 Java 类加载。

0.1.0 暂无历史版本迁移。未来只通过显式、纯函数迁移链产生新副本，保留原件，不把 21.1.x 自动升级视为格式迁移。往返标准：相同版本的 import(export(document)) 在语义上等价，nodes 顺序与 ID、数值、AST 和 extensions 保持一致；格式化缩进不是语义。引用重命名与删除必须在一次编辑事务内更新或阻止，不能留下悬空 behavior。

ZIP 导入拒绝绝对路径、`..`、重复条目、路径大小写碰撞、过量解压和非预期文件；只接受约定目录 PNG，不取远程 URL，不执行包内脚本。所有检查通过才以新项目导入。Blockly 的积木布局和编辑器缩放可作为独立本地 UI 状态缓存，丢失不影响规格重新编辑。
