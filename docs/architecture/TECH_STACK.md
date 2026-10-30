# 网页技术方案审计

审计日期：2026-10-27。状态：设计决策，尚未安装依赖或进行浏览器性能验证。

## 产品边界

V1 是 Minecraft Java 1.21.1、NeoForge **21.1.244**、Java 21 的 GUI 规格设计器。交付设计 JSON、参考 PNG、实现 Prompt；不生成可运行 Java GUI，不连接游戏，不承担服务器权限验证。网页中的交互演示只是规格模拟。

## 技术决策

| 候选 | 决策与职责 | 替代方案及主要代价 | 验证门槛 |
|---|---|---|---|
| React + TypeScript + Vite | 推荐。单页静态应用，React 负责面板，TS 严格模式；Vite 负责开发与构建 | Next.js 的路由和服务端能力目前无需求；直接 DOM 也可完成画布，但选择框、变换、截图需自行协调 | 初始化时锁准确版本与 lockfile，typecheck、build、静态预览通过 |
| React-Konva + Konva | 有条件推荐，首个实现任务做小型验证。仅负责场景显示、命中、拖拽、选择框和 PNG | DOM/CSS 的文字输入和无障碍更容易，但截图与缩放坐标复杂；SVG 可行，无需同时维护两套渲染器 | 缩放/平移后落点与导出一致，DPR 1/2，300 个简单节点可交互；记录测试机器与帧时间再判断 |
| Zustand | 推荐，一个编辑会话 store 即可；用 selector 限制面板刷新 | React reducer 也够用；没有必要建立插件总线或多个互相同步的 store | 拖动开始到结束只产生一个撤销记录，取消拖动不改文档 |
| Zod | 推荐，所有导入与持久化恢复的运行时校验入口；领域模型独立 | TS 类型无法校验外部 JSON；手写 guard 容易遗漏交叉引用 | 类型分支、尺寸、唯一 ID、事件目标、版本拒绝均有负例 |
| Blockly | 后续再引入；提供积木 UI，编译到项目自有行为 AST | 先使用有限事件/动作表单；避免第一版把 Blockly 加载成本、布局和序列化绑定到核心 | AST→积木→AST 语义相等；未知积木不能静默丢失；不使用 JS eval 或 Blockly JS 生成器执行项目 |
| IndexedDB | 推荐，浏览器本地保存项目快照及用户资产 Blob；原生 API + 小仓储封装起步 | localStorage 同步且容量有限，适合视图偏好；暂不引入 Dexie 除非事务代码明显重复 | 浏览器实测事务、升级、配额失败、刷新恢复，失败保持 dirty；导入不覆盖旧项目 |
| Vitest + Playwright | 推荐。前者测领域纯逻辑，后者测真实拖拽、文件往返、存储、PNG | 不给可逆样式变动建立机械单测；Canvas 截图也不能证明 Minecraft 像素精确 | 最小闭环 E2E，通过数据坐标断言和少量稳定截图共同验证 |

这些是能力适配判断，不是已验证的包版本兼容报告。参考项目 package.json 不能用作本项目依赖版本依据。实施时选择互相兼容的稳定版本并记录 Node、包管理器、全部准确版本；本阶段不创建 package.json。

## 最小分层

依赖方向：React 面板 / Konva / Blockly 适配器 → 编辑操作 → 领域文档与校验。存储、PNG 和 Prompt 导出从领域快照读取，不能反向从 Konva 节点推断项目内容。

建议后续结构（当前不创建代码）：

- `domain/`：中立模型、组件目录、几何约束、引用校验。
- `editor/`：文档修改、会话选择状态、历史；拖动过程只保留临时状态，提交时写领域坐标。
- `ui/`、`canvas/`：面板和网页近似渲染适配。
- `io/`：JSON/资源包、IndexedDB、PNG、Prompt。
- `behavior/`：有限 AST 及未来 Blockly 适配；先不建立通用脚本系统。

不引入 ECS、CRDT、依赖注入容器、服务端、账号或远程 AI 调用。组件目录是静态数据和少量校验函数，不做运行时插件平台。

## 画布约束

1. 文档单位是 Minecraft GUI 逻辑像素，不是 CSS 像素或物理屏幕像素。坐标转换只在适配器发生：`logical = (pointer - stageOffset - pan) / zoom`，提交时取整。
2. Konva Transformer 改的是 scale；结束时转换为合法 width/height 并清回 scale=1，禁止把 scale/rotation 写入领域 JSON。V1 禁止旋转，单 Screen 居中参考设计区，不做任意嵌套布局。
3. 面板与文本编辑使用 DOM。Canvas 不承担 IME、键盘输入框或完整无障碍；画布可选择节点，DOM 属性表单承担精确输入、可访问标签、键盘操作。
4. 网页不会执行 Java Widget。默认自绘中性占位皮肤，标注“近似参考”。Minecraft 字体宽度、资源包、语言、GUI scale、悬停/禁用态会导致差异；不能承诺像素一致。
5. 参考 PNG 单独用文档快照渲染，剔除选择框/网格/面板，输出尺寸由设计区和导出倍率决定，与编辑视图缩放无关。外链图片可能污染 Canvas；V1 仅接收用户本地 PNG，解析失败用占位并阻止伪成功。

## 保存与交付

IndexedDB 为缓存式本地工作副本，导出的项目包才是可携带备份。建议 `projects` 保存文档、revision、modifiedAt，`assets` 保存按资产 ID 关联的 Blob；同一次资源与文档保存放在事务中。首轮一个本地项目即可，不实现项目管理后台。localStorage 仅保存 UI 偏好。

使用保存 revision 防止较旧异步请求覆盖较新快照；保存失败显示未保存状态并允许下载 JSON。多标签页最小方案为单写入锁（Web Locks 可用时）并在不可用时检测 revision 冲突、停止自动覆盖。私密浏览、清理站点数据、配额不足均不能保证持久保存。

导出分两步：先单文件 JSON 往返；有用户图片后再引入 ZIP 包。JSON、PNG、Prompt 是同一 revision 的派生物。Prompt 明确原生类别、已知限制、未解析资源及服务端实现责任，不声称已经实现 Mod。

## 证据与范围

Minecraft 版本依据和源码证据见 [组件审计](../minecraft/GUI_COMPONENT_AUDIT.md)；参考项目真实架构见 [M3E 审计](../research/M3E_CANVAS_REVIEW.md)。技术能力的官方入口：[Vite](https://vite.dev/guide/)、[React-Konva](https://konvajs.org/docs/react/)、[Zustand](https://zustand.docs.pmnd.rs/)、[Zod](https://zod.dev/)、[Blockly 序列化](https://developers.google.com/blockly/guides/configure/web/serialization)、[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)、[Vitest](https://vitest.dev/guide/)、[Playwright](https://playwright.dev/docs/intro)。这些链接供实施时核对，不作为本阶段已运行验证的证明。
