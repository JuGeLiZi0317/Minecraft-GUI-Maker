# H2-A 顶部 CreativeTab 原型合同

锁定 Minecraft Java 1.21.1 / NeoForge 21.1.244 / Java 21。节点是独立视觉声明，来源标记 `screen-internal`，不是可直接实例化的原生 Widget。`name` 是 Inspector/实现规格名称，不在贴图上绘制；`column` 为 1–7，用于选择顶部 Sprite；`selected` 是设计初态。每个节点独立，没有互斥、图标、点击事件或内容切换。Screen、Java 代码、服务端逻辑均未生成。

Schema 0.10.0 才允许此节点；添加节点与升级共用历史事务，旧文档不静默升级。固定 26×32，整数 x/y 是 Sprite 左上角，必须位于设计区内。Inspector 不提供缩放；原版顶部点击区域相对 Sprite 上移 4 GUI px，仅供实现者参考，本原型不进行游戏交互检测。可将 Panel 的 y 设为 28，并将标签 y 设为 0，得到 4 GUI px 的面板重叠；这是用户手动布局，并非自动锚定。

绘制顺序是未选中 CreativeTab（按节点数组顺序）、Panel、剩余节点（按数组顺序）；Canvas 与设计区 PNG 使用同样规则。Panel 独立图只包含 Panel，仍使用设计区全局坐标，不含标签。位于 Panel 之前的标签可被 Panel 覆盖；这是有意的限定层级，不等同完整创造模式 Screen 的所有图层。

顶部 14 个 `minecraft:container/creative_inventory/tab_top_{unselected|selected}_{1..7}` 从用户会话的客户端 JAR 和兼容覆盖层按需读取，不内置贴图。缺失、解码错误或不支持时显示带交叉线的中性方块，并给出诊断；导出 manifest 记录资源状态，PNG 不含诊断文字。资源切换遵循现有导出快照取消合同。不同资源包可覆盖对应 Sprite；浏览器绘制与游戏效果没有像素级等价声明。

导出权威 JSON、派生规格、Prompt、manifest 和 ZIP 复用既有管线。实现者需要自行实现点击命中、状态维护和内容切换；创建其他 Screen 是独立职责，本节点不会自动创建 Screen。图标、底部标签、自动组布局、互斥、Blockly、Java 生成器和游戏运行时均未实现。
