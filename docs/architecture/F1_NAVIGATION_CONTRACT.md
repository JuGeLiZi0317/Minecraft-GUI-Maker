# F1 矩形交互与声明式导航合同

> F2 的有序动作和引用删除保护取代下文自动级联删除；现行规则见 [F2 合同](F2_ORDERED_BEHAVIOR_CONTRACT.md)。

Schema 0.7.0 在单个已有 Screen 上允许可选 `screenTargets` 数组（最多 100 项），每项为严格 `{id,name}`。ID 与项目、Screen、节点、规则 ID 全局唯一；名称非空且不超过 128 UTF-16 单元。目标只声明身份与显示名称，不包含目标画布、Java 类或浏览器导航。重命名保留 ID；目标仍被 `open_screen` 引用时拒绝删除，需先修改或删除规则。旧 0.1.0–0.6.0 文档不自动迁移；旧版本携带目标字段或 F1 规则被拒绝，0.7.0 支持 F0 和 D-Shadow。首次创建目标、首次保存 F1 规则与升级分别进入各自历史事务。0.7.0 不因后续 Panel、控件或阴影操作降级。

F1 规则新增 `rectangle-click` 事件（sourceId 必须指向 `minecraft:fill`）和 `open_screen` 动作（`targetScreenId` 必须指向当前文档的声明目标）。任何已支持事件均可搭配 `open_screen`；矩形事件也可搭配 F0 动作。无悬空引用。删除源节点仍按 F0 同一事务删除引用该节点的规则，可撤销。矩形始终为 `vanilla-draw`、`GuiGraphics.fill`，不成为原生 Widget。

设计模式保持选中、拖动；显式开启「画布行为测试」后，点击 Button、Checkbox 或 Rectangle 触发规则，拖动不修改文档。模拟 `open_screen` 只显示目标 ID 和名称，不切换画布或创建 Screen。重置、关闭行为面板或更改文档清除临时状态。现有 F0 的模拟触发、持久化及初态导出不变。

导出合同 0.5.0 包括规则和目标声明。Prompt 分别说明绘制、鼠标命中检测或交互包装、目标 Screen 的创建和切换，均由开发者实现。静态源码证据：锁定映射 `net/minecraft/client/gui/components/events/ContainerEventHandler.java:50` 的 `mouseClicked` 委派给子监听器，`net/minecraft/client/Minecraft.java:1019` 存在 `setScreen`；这些定位不证明特定实现的输入路由、导航时机或游戏表现。精确命中检测、焦点、Screen 生命周期及运行时实现是产品建议和待验证事项。ZIP 是同快照交付，不包含可执行 Java。
