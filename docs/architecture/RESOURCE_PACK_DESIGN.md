# 用户自备资源导入与解析合同提案

状态：**设计建议，尚未实现或授权实施**。目标 Minecraft 1.21.1 / NeoForge 21.1.244 / Java 21 / 客户端 pack format 34。源码与资产证据在 [资源审计](../minecraft/GUI_RESOURCE_AUDIT.md)。本合同不修改权威 GUI Schema、撤销历史、IndexedDB 或 GUI Scale 算法。资源会话与项目文档分离；不保存路径、句柄、Blob URL、原始字节或浏览器缓存对象到 GUI JSON。

## 来源、验证和授权

1. 文件夹：用户手动选择 pack 根；使用浏览器支持的目录选择能力或逐文件目录上传 fallback，显示本次授权范围；不声称所有浏览器支持 File System Access 或可访问任意安装目录。拒绝后台递归扫描用户系统。ZIP：用户选择文件，只在本机读取、解压，拒绝加密/多卷、未知压缩或重复规范化路径。JAR 作为用户指定的 ZIP 文件只读 `version.json` 与所需 assets；不执行类、嵌套 JAR、manifest 命令，也不当普通资源包。
2. 普通包根必须含有效根级 `pack.mcmeta` 的 `pack.description`、整数 `pack_format`，及至少可识别的 `assets/` 或适用 overlay；ZIP 若外层多包一层目录，不静默猜：仅在唯一候选、用户明确选择后接纳；多个候选拒绝并列出。JAR 本机实证无根 `pack.mcmeta`，单独检查 `version.json` 的 id 1.21.1、resource 34 与必要 `assets/minecraft/atlases/gui.json`；它证明自报版本而非真实性，非官方或被改造 JAR 必须警示。缺失、异常或不符均拒绝作为已验证基础；可识别资源目录如无可信版本证明，标记 `unverified`，不得冒称 1.21.1。
3. 普通包兼容检查按 [Pack.java:80](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/server/packs/repository/Pack.java:80) 和 [PackMetadataSection.java:12](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/server/packs/metadata/pack/PackMetadataSection.java:12)：`supported_formats` 合法且包含自身 `pack_format` 时以范围判断34；否则游戏回退主格式。提案默认阻止不包含34的包参与准确预览，明确解释原因；日后若允许用户覆盖，仅标为不兼容实验，不能标为游戏行为验证。malformed metadata、缺文件或未来格式不可默默降级。NeoForge 条件和自定义 pack 机制尚未实现时明确 unsupported。
4. 顺序以 UI 明示列表从低到高：用户指定基础资源、然后覆盖包；可重排，预览解析 provenance 显示每层标识。不得暗示它自动包含游戏运行时内置、模组资源、服务器包或启动器 assets。游戏中这些可能还有额外来源；用户须手动提供，缺失则说明。读取过程可取消；所有检查通过后才原子替换资源会话，失败保留旧会话，不写项目历史。重排使解析版本及依赖缓存失效。

## 分层解析语义

- 普通文件高层优先；按目标源码实现 pack filters（包括仅 filter 层），区分 missing、filtered 与 invalid。图片存在的最高层确定后，同名 `.png.mcmeta` 从最高层向图片层搜索，遇 metadata filter 截止；不查图片层以下、不进行 section 字段合并。优先级与每个结果的图片层、元数据层分别报告。缺少 gui section 或 scaling 为 stretch；解析损坏与缺省不同，报 invalid，不能静默沿用低层或默认值。
- 包内 `overlays` 和 `neoforge:overlays` 是 1.21.1/NeoForge 已有机制：[OverlayMetadataSection.java:12](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/server/packs/OverlayMetadataSection.java:12)、[Pack.java:95](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/server/packs/repository/Pack.java:95)、[CompositePackResources.java:22](D:/Minecraft/AIStudio/skills/minecraft-neoforge-dev/api_references/net/minecraft/server/packs/CompositePackResources.java:22)。先选适用34的 vanilla overlays，再追加 NeoForge overlays，组合查找中后列 overlay 优先于前列，均优先于主资源；组合后才参与包之间的资源/元数据筛选。条件化 overlay 或 source 无法准确求值时标记 unsupported，相关结果不可声称 exact。
- atlas 定义是 stack，按低到高追加 source，再顺序执行，包括目录/单文件及删除、重命名等规则；后 source 可替换前结果。第一增量可以仅支持经测试的 directory/single 子集，但遇未知或改变相关结果的 source，返回 unsupported，而不是直接拼路径假装有效。font 定义也是 stack，须独立处理 provider 顺序、引用和条件，禁止简单覆盖整个 JSON。
- 图片缺失、解码失败、非法元数据、动画、缺少字形、受过滤、未知 source/字体 provider 分别报告。提案的错误策略是显示可辨识占位和原因；不得称其与游戏原版 missing texture 的具体渲染完全一致。动画没实现则报告 unsupported，不将首帧标记为准确。

## 安全及资源预算（产品提案，非游戏限制）

预检查 ZIP 中央目录并流式检查实际解压量，禁止绝对路径、盘符、反斜杠、空/`.`/`..` 段、NUL、符号链接、大小写或规范化后碰撞、重名、嵌套归档执行；校验 ZIP 条目大小、CRC 以及路径后才创建索引，不写系统磁盘。限制建议：输入 ZIP/JAR 上限 512 MiB；最多 100,000 条目；单条未压缩 64 MiB；累计实际解压 1 GiB；单 PNG 轴≤8192、像素≤16,777,216，解码前检查 IHDR 并解码后复核；单 JSON/mcmeta≤2 MiB；压缩比超 200:1 触发拒绝，且总量和单条上限独立生效。目录输入也执行等价文件、条目和累计预算；检查头信息不能替代真正的有界解码。阈值是首轮提议，需用真实客户端 JAR 和合法高分辨率包验证并可调整，不能将拒绝等同游戏不兼容。读取按需，递归、动画、引用深度另设上限；支持取消、耗时预算和 worker 隔离，防止 ZIP 炸弹及 UI 长时间阻塞。实施前要验证所选 ZIP/PNG 库能可靠执行上述要求；目前无已选库。

不上传、不遥测文件名或素材，不默认写 IndexedDB/Cache Storage；文件句柄及对象 URL 是内存会话，切换/关闭时释放、revoke 并中止任务。持久化或网络访问须另行获得明确授权。浏览器 API 的目录选择、ZIP 大文件、内存/Canvas 限额及不同浏览器行为均待实际验证。

## 与 UI/渲染器解耦的接口草案

```ts
type Status = 'valid' | 'missing' | 'filtered' | 'invalid' | 'unsupported' | 'unverified';
type Provenance = { resourceLayer?: string; metadataLayer?: string; atlasSources?: string[] };
type Result<T> = { status: Status; value?: T; provenance: Provenance; diagnostics: string[];
  features: { animation: 'none' | 'present' | 'unknown'; fidelity: 'supported' | 'approximate' | 'unsupported' } };
interface ResourceView {
  resolveSprite(id: string): Promise<Result<SpriteDescriptor>>;
  resolveTexture(id: string): Promise<Result<TextureDescriptor>>;
  resolveSpriteScaling(id: string): Promise<Result<Scaling>>;
  resolveFont(id: string): Promise<Result<FontDescriptor>>;
}
```

`SpriteDescriptor` 记录 ID、解析后的图片资源键、采样区域和来源；`Scaling` 是 stretch/tile/nine_slice 有效的结构值；font descriptor 是有序 providers/引用及诊断，而不是假设一个字体文件。结果为会话中不透明数据句柄及不可变描述，非 React/Konva/IndexedDB/Blockly 对象，资源字节通过独立只读受限接口按需获取。resolveSprite 和 scaling 必须同一次资源快照版本，资源层变更时旧异步结果丢弃；UI 和 Canvas 根据 status 明确标记结果，绝不改变文档。缓存键包括会话 revision、资源 ID、图像及元数据来源/内容、atlas 版本、目标尺寸和采样规则；设置预算并释放已淘汰的图像。上述类型是接口表达示意，非已实现 API。
