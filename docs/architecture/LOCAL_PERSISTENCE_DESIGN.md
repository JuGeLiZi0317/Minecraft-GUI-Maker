# C：本地持久化独立设计

2026-10-27。A+B仅在已声明的自动化范围内收束。GUI Scale的游戏内视觉一致性、跨输入法、物理DPR、其他浏览器和环境收尾继续OPEN，不阻塞本阶段。用户仅授权C，不开展D～H。

## 目标与边界

在同一浏览器配置、同一origin下自动保存**已提交的领域文档**并刷新恢复。保存失败可继续内存编辑和JSON备份；绝不显示伪“已保存”。不保存拖动/文本草稿、选择、历史、Zoom/Pan、GUI Scale预览，不扩展权威Schema，不引入服务器、账号或云同步。

原生IndexedDB，小型repository与保存会话控制器；不增加依赖。C不支持用户图片，因此不提前创建资产存储或实现E模块。JSON仍是可携带备份，本地数据库不是无限期保存承诺。

## 数据库与导入

数据库 `minecraft-gui-maker`，版本2：

- `projects`，keyPath=`localId`：`{localId, storageRevision, updatedAt, document}`，updatedAt索引用于列出本地副本。
- `workspace`，keyPath=`key`：唯一active记录 `{key:'active', localId:string|null, revision}`。

localId为浏览器生成的UUID，与JSON的project.id分离，允许导入同名/同ID项目。storageRevision/workspace.revision为仓储递增序号；不使用可随undo下降的领域revision判定写入先后。

每次导入先走同一严格领域校验，再创建新的localId，保留导入前副本及其待保存快照；不覆盖旧localId。简单下拉列表用于重新打开保留的本地副本，不建立项目后台、批量管理或云服务。撤销导入仍遵循A+B领域历史，不切换仓储身份；旧内容会作为新副本的编辑结果保存。

## 事务、队列和成功语义

一次readwrite事务同时读取项目及workspace序号，比对预期值后写项目与active指针；任一失败全部回滚。只有transaction.complete才确认保存。事务中不await外部任务。

会话维护单个串行写循环，按localId合并待保存快照；新编辑在旧写入期间发生时继续排队，不允许旧响应把新内容标为已保存。普通已提交编辑、删除、尺寸变更、undo/redo都触发保存；指针移动草稿或视图变换不触发。短防抖合并连续修改；“立即保存”绕过防抖但不绕过版本比较。

导入前后不同localId的快照都保留在队列，先写旧副本，再写新副本并激活；失败暂停自动重试，dirty保持。QuotaExceeded、事务中止、不可用数据库、升级阻塞均显示可理解错误，提供重试和JSON导出。

## 启动、恢复和并发

启动完成前禁止编辑与自动保存；只在验证整个本地记录及领域文档后恢复，不制造历史。空数据库新建一个本地副本。恢复错误保留原记录，提供原始记录下载；显式“创建新副本”才从空文档继续，仍不删除损坏记录。不支持的数据库未来版本不降级或清库。

优先取得Web Locks独占writer锁，其他标签页只读查看最后保存内容。关闭写入页后，只读页可重新连接；不自动抢占或合并。Web Locks不可用时，各页可编辑，但事务CAS保证只有基于当前仓储版本的写入能成功，竞争失败页冻结编辑并要求先导出JSON再重新连接。不会最后写入者无提示覆盖。

connection收到versionchange时主动关闭并暂停保存，防止阻塞其他升级。升级只补缺失的stores/index，不清除记录：初次0→2创建结构，1→2增加updatedAt索引。版本1是为升级测试定义的旧结构fixture，**没有声称曾发布过数据库v1**。未来改变记录结构须另写迁移。

## 页面离开与风险

页面隐藏时尽力flush；pagehide释放writer锁并关闭连接。未保存内容使用beforeunload提醒。异步IndexedDB无法保证浏览器被强杀、系统崩溃或立即断电前写完；未提交文本也不属于保存快照。清理站点数据、私密模式、不同端口/origin、配额和浏览器回收均可能影响本地副本。

## 验收计划

真实Chrome IndexedDB覆盖刷新恢复、尺寸/Unicode预览数据隔离、undo保存、导入保留副本、v1→v2升级、未来/损坏记录保护、事务中止与QuotaExceeded注入、versionchange关闭、Web Locks双页、无Web Locks的CAS双页竞争。控制器单测用延迟repository验证串行队列、保存期间新编辑、错误dirty与重试；不把内存假实现当IndexedDB实测。原A+B合并回归须继续通过。所有限制及未完成项继续标OPEN，不推断跨浏览器或游戏内结果。
