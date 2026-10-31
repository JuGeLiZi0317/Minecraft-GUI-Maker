# M1-F 入口、生命周期和导出合同

Schema 0.13.0 新增根级必填 `entryScreenId`，引用真实 Screen。0.1.0–0.12.0 原样读取，禁止携带入口字段；旧文件读取不升级、不写回。结构树选择入口时，在一个历史事务中升级并保存所选 ID；旧单屏可显式选择唯一 Screen。删除入口须先选择替代入口；重命名保持身份。当前编辑 Screen 仍是会话选择，不推断运行入口。旧文件导出标注入口未指定，不借用 manifest 捕获状态。

用户确认的默认语义由 `src/domain/runtimeContract.ts` 定义并实际写入规格、Prompt、manifest：PreviewSession 从 entryScreenId 开始；每次 open_screen 在来源 Screen 内解析声明及 boundScreenId，创建目标 Screen 新实例并从权威初态初始化局部状态，包括重复打开自身。页面切换保留 PreviewSession 身份，但不缓存页面局部状态；重启会话清除临时状态并从入口启动。未绑定目标不导航；定向打开不等于历史返回，普通按钮不会隐式 pop。Esc／系统返回键由具体实现者明确处理。无历史栈、共享变量、页面缓存或跨 Screen 状态共享。旧 screen_test Checkbox 保留行为仅是历史测试选择，不追溯改写实测记录。

Screen 原生整屏背景（世界模糊／默认／清空）未由项目指定，实现者显式决定。设计参考 PNG 包含 Panel 和组件，不能当作仅背景资产。Panel 方形 PNG 已按 Screen 设计区全局坐标烘焙 panelBounds 偏移；将其左上 contentWidth×contentHeight 绘制于 Screen 设计原点一次，不得再次平移 panelBounds。绘制层为原生 Screen 背景、未选中标签、Panel、其余组件与文字。浏览器字体 family/generation 只用于参考会话诊断，不是 Minecraft 字体资源 ID，也不证明像素可复现；用户字体源不随 ZIP 携带，游戏字体需资源与授权确认。textShadow=false 和已有逐组件原生／自定义绘制责任保留。

版本独立演进：项目 Schema 0.13.0 控制权威结构及导入；export/reference 0.7.0 控制快照与解释合同；manifest 0.8.0 控制派生文件索引及入口／渲染／版本元数据；实现规格 0.2.0 控制派生组织。导入仅验证项目 Schema，不用 manifest 猜测结构。

派生规格以 designIntent.screens[] 为主；旧单页字段作为 screens[0] 的只读兼容别名，legacyCompatibility 指明来源 ID，不能视作额外 Screen 或独立权威。多屏 Prompt 仅按真实 Screen 列举一次。jsonPointer 是当前快照数组索引的 RFC 6901 定位；stableLocator 的 /screens/by-id/... 是自定义身份表达式，不是 JSON Pointer。节点和行为来源同时记录稳定 Screen/实体 ID 和本次快照 Pointer；重排重新计算 Pointer。
