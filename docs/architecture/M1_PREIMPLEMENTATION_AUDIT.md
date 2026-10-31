# M1 实施前审计（未实施）

## 现状

- `src/domain/schema.ts` 严格要求 `screens` 长度为 1；当前 Screen 具有稳定 `id`、`title`、设计区、Panel、节点和行为。项目 ID、Screen ID、节点、规则和 F1 目标声明 ID 使用同一全局唯一集合；标签组内容引用在本 Screen 校验。
- F1 的 `screenTargets` 是 Screen 内的 `{id,name}` 声明，不包含画布；`open_screen.targetScreenId` 只能引用该声明。F2 的节点引用在当前 Screen 内解析，规则和动作按文档顺序执行。H2-B 初态、临时预览与 F2 显式可见性覆盖合同见 `H2B_TAB_GROUP_CONTRACT.md`。
- `src/editor/store.ts` 将完整项目文档作为历史快照，但所有编辑及手势路径操作 `screens[0]`。IndexedDB 通过 `src/io/localSession.ts` 持久化完整文档，恢复通过严格 Schema 校验；历史与选中状态不持久化。
- Canvas、Inspector、行为编辑器和尺寸设置均直接读取 `screens[0]`；`src/exports/visualSnapshot.ts`、`designPng.ts`、`bundle.ts` 与 `specification.ts` 也仅处理首屏，导出规格固定使用 `/screens/0/nodes/`。manifest 0.6.0 以单 Screen 图像及 Panel 为形状；当前 ZIP 复用此同快照导出管线。

## 兼容问题与建议

F1 中一个有效目标可能仅有名称和 ID，而没有真实 Screen。现有全局 ID 校验也禁止声明和 Screen 使用同一 ID。直接把声明解释成真实 Screen 会违反旧语义；直接要求真实 Screen 会拒绝合法旧规则；按名称匹配、自动建空画布或删除规则均可能改变设计意图。

建议新版本（例如 0.12.0）明确区分旧声明目标与真实 Screen 引用：旧项目不因读取而变更；升级或编辑时提供明确的绑定／转为新 Screen 操作，并在一个历史事务中保留或更新所有引用。对新建的真实 Screen 导航施加严格 ID 验证，删除被引用 Screen 时阻止操作。具体是保留未绑定的旧声明、还是要求用户在升级时逐项绑定，应先落实为明确产品合同；不能把未绑定声明称为已存在的 Screen。引用、显示名称、ID 唯一性以及取消迁移时的数据保持都需要测试。

建议将活动 Screen ID 定义为会话状态，并使所有编辑、草稿校验、画布与行为操作显式携带它；切换时提交或阻止未完成草稿、清除节点选择及临时预览，避免误改其他 Screen。项目级完整快照仍是撤销单位，新增第二屏及版本升级必须原子提交。

导出应为多 Screen 建立版本化规格与 manifest，针对每屏捕获资源／字体一致的初态图和必要 Panel 图，同时保留项目级原始 JSON、整体快照引用和明确的当前屏单项下载。稳定文件名应包含 Screen ID 并处理碰撞与预算；不能仅循环替换 `screens[0]` 后复用原先单屏 manifest 或项目散列。

本次审计未更改产品代码、Schema、持久化或导出，也未执行测试；未完成 M1，以上是实现方案而非已验证行为。工作区已有未提交修改，未覆盖或清理。
