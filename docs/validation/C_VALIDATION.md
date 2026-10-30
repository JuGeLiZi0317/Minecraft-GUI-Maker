# C：本地持久化实施与验收

日期：2026-10-27（Asia/Shanghai）。仅C独立设计和实现。A+B按用户裁定在自动化声明范围收束；D～H未开展。本文件不关闭游戏内视觉一致性、跨输入法、物理DPR、其他浏览器或环境收尾OPEN项。

## 已交付

- 原生IndexedDB保存已提交领域文档，启动校验后恢复；保存状态、350ms防抖、立即保存、错误重试。
- 项目记录与活动指针同一事务提交；独立仓储序号，串行队列防止较旧响应将较新设计标成已保存。undo/redo也保存，草稿/视图/历史不持久化。
- 导入另建localId副本，保留旧副本及导入前未保存快照；最近50项本地副本可重新打开，无自动删除策略。
- 损坏/不支持版本的项目保留原记录，提供原始记录下载和显式创建新副本；未来数据库版本不降级或清库。
- Web Locks只允许一个写入标签页，其他页面只读；缺少Web Locks时使用事务CAS拦截旧页面覆盖。冲突冻结当前页并允许JSON备份，不提供强行覆盖。
- 初次数据库创建、v1→v2补索引、升级阻塞处理、versionchange主动关闭连接。没有服务器、账号、云同步、新资产类型、PNG/Prompt导出或Java生成。

独立合同：[LOCAL_PERSISTENCE_DESIGN.md](../architecture/LOCAL_PERSISTENCE_DESIGN.md)。操作入口：画布上方的本地保存状态、“立即保存”、“本地副本与保存说明”；异常时呈现重试或恢复入口。[页面截图](c-local-save.png)。

## 最终结果

用户随后确认复现命令逐条执行、66项测试均PASS，并反馈关键流程实测“按预期进行”。具体确认范围：两个标签页会锁定新增；关闭后刷新能够保留进度；导入JSON能够保留工作进度。本次将其记录为用户实测通过，不额外推断浏览器版本、其他编辑操作的锁定、物理DPR或系统级故障覆盖。

据此，C在本报告的自动化范围及上述用户实测范围内收束。游戏内视觉一致性、跨输入法、物理DPR、浏览器兼容与环境收尾继续OPEN。

| 检查 | 实际结果 | 证据 |
|---|---|---|
| `npm.cmd run typecheck` | PASS，退出码0 | 本轮实际运行，无TypeScript错误 |
| `npm.cmd run build` | PASS，退出码0；保留体积警告 | JS约615.40kB / gzip189.16kB；未提高warning阈值 |
| Vitest | **55/55 PASS**，4个测试文件，0失败 | [c-vitest-results.json](c-vitest-results.json) |
| Playwright完整回归 | **66/66 PASS**，退出码0，0跳过/失败/不稳定 | [c-playwright-results.json](c-playwright-results.json) |
| C专项调试回归 | 先20项、补充后28项均通过 | 最终66项已包括全部28项，调试运行不替代完整报告 |

本阶段没有新增npm依赖，没有改变现有精确版本或package-lock。环境沿用Windows x64（10.0.26200）、AMD Ryzen 7 7735H、16逻辑核心、约15GiB内存、Node24.17.0/npm11.13.0、Playwright1.56.1、实际Chrome156.0.8078.47。browser context模拟DPR1/2，各为1440×1000 CSS px，单worker串行、正常权限终端；不是两台物理显示设备。

## 真实IndexedDB测试矩阵

下列14个场景均在两个DPR context各运行一次：

| 场景 | 主要实测断言 |
|---|---|
| 保存/undo/刷新恢复 | 实际写入后刷新，文档逐字段恢复，history清空；Zoom/Pan/GUI Scale预览重置，视图变化不增加数据库写入序号 |
| 导入与重新打开 | 同名/同project.id导入形成两条独立本地记录，旧文档保留；打开旧副本并刷新仍恢复旧文档 |
| v1→v2升级 | 真实创建v1测试数据库，升级后保留领域文档和两个保存序号，只增加updatedAt索引 |
| 未来Schema项目 | 未覆盖原记录、编辑锁定、原始恢复记录可下载、显式新建后旧记录仍存在 |
| 损坏文档 | 与未来Schema相同的保护流程，验证缺少有效项目结构的记录 |
| 无效JSON导入 | 文档、本地副本数量、原记录与workspace均保持不变 |
| 暂时不可用 | 注入SecurityError阻断IndexedDB.open；内存可编辑；恢复API后重试成功，保存最新内容 |
| 升级被阻塞 | 真正持有v1连接阻塞v2升级，页面错误提示且保留内存；关闭旧连接后重试保存成功 |
| 配额失败路径 | 在真实IndexedDB的项目put入口注入QuotaExceededError；事务回滚、旧数据未改变、dirty不清除、JSON可导出、后续编辑与重试保存最新快照 |
| 事务中止 | 在真实put请求后主动abort事务，项目/活动指针均未部分更新，错误状态、备份与重试通过 |
| 双标签页Web Locks | 第二页只读并能导出；关闭第一页，第二页重新连接取得写入权并保存 |
| 无Web Locks竞争 | 两页基于同一版本载入，第一页保存更新后，第二页写入被CAS拒绝；数据库保持第一页设计，第二页内存设计保留并冻结 |
| versionchange | 请求数据库更高版本，应用关闭活动连接并冻结编辑，领域文档未丢失 |
| 未来数据库版本 | 真实v3库未被v2应用降级或清空，内存编辑与JSON备份仍可用 |

“配额失败”是受控QuotaExceededError注入，**没有填满真实磁盘或耗尽浏览器实际配额**；“暂时不可用”同样是浏览器API故障注入，未修改用户系统存储设置。升级阻塞、原生事务abort、真实数据读写与同context双标签页均由真实IndexedDB/Web Locks执行，不是内存模拟。

控制器另外有6项单测，以可延迟repository验证旧写入确认期间继续编辑、失败后较新快照、undo保存序号独立递增、导入前后副本身份、导入到达正在写入时仍保留双方、竞争冻结及versionchange不被迟到成功响应覆盖。这些单测不替代上表的原生浏览器验证。

## 数据保护与当前限制

- 只有transaction.complete且当前领域快照也被确认时才显示已保存。失败暂停自动重试，保持dirty；不会在故障循环中持续刷写。
- 文档revision可随undo下降；本地storageRevision/workspace.revision仍独立增加。JSON没有混入仓储字段、React/Konva对象或视图状态。
- 导入不会覆盖旧localId；撤销导入只恢复领域内容，不切回旧仓储身份。打开其他副本会先保存当前副本，并重置编辑历史。
- 浏览器强杀、操作系统崩溃、断电、清理站点数据、配额回收或私密模式生命周期不能保证不丢内容。页面隐藏flush和离开提醒只是尽力保护，不是同步落盘保证。
- 保存范围是已提交文档。尚未按Enter/点击别处提交的文字、拖动草稿和内存撤销历史不保存。
- DB v1为升级测试fixture，未声称存在已发布的旧版。当前DB v2没有资产表，C不支持资产保存；后续需要时另行设计迁移。
- 本地副本列表最多显示最近50条，不自动清理历史记录。大量导入可能占用配额，出现错误时应导出JSON；本阶段不扩展完整项目管理后台。

## 保持OPEN

| 项目 | 状态与范围 |
|---|---|
| GUI Scale游戏内视觉一致性 | **OPEN**；C未运行Minecraft |
| 跨输入法、物理DPR、Firefox/WebKit等兼容 | **OPEN**；不把Chrome/context覆盖外推 |
| 下载浏览器与沙箱/环境收尾 | **OPEN**；本轮正常权限终端完整退出0，不证明原环境问题已解决 |
| 实际配额耗尽、强杀/断电/BFCache极端时序 | 未以硬件或系统级故障复现；只对上述注入和正常页面生命周期作声明 |
| 慢网首屏与包体积 | 保留原OPEN；此次增加存储代码后仍有Vite单入口大于500kB提示 |

未出现需要用静态检查代替的C失败测试。已有OPEN不阻塞C，不被自动关闭。

## 复现及文件

```powershell
Set-Location -LiteralPath 'D:\Minecraft\AIStudio\workspace\Minecraft GUI Maker'
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
$env:GUI_BROWSER_CHANNEL = 'chrome'
npm.cmd run test:e2e
# 专项：npx.cmd playwright test tests/persistence.spec.ts
Remove-Item Env:GUI_BROWSER_CHANNEL
```

测试使用隔离browser context，新建的测试数据库不在用户正常Chrome配置中；没有清理用户现有数据库。测试服务器由Playwright启动并收尾，最终运行退出码为0。

实现位于 `src/io/repository.ts`、`src/io/localSession.ts`、`src/ui/LocalSavePanel.tsx`，并接入 `src/main.tsx`、`src/App.tsx`和编辑store的恢复/只读门控。画布、属性及尺寸编辑共用门控；Schema未改变。新增 `src/io/localSession.test.ts` 与 `tests/persistence.spec.ts`。未初始化Git、未提交/推送或部署。

完整回归也再跑了原有300节点采样，数据另存[DPR1](c-performance-dpr1.json)和[DPR2](c-performance-dpr2.json)，不覆盖旧记录、不设FPS阈值，RAF调度间隔的解释限制沿用A+B报告。

C到此停止，等待下一阶段授权。
