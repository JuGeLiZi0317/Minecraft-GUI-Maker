# 资源系统第二批：基础 JAR 与单覆盖层

2026-10-28。限定结论：在下述测试条件下，1.21.1 自报客户端 JAR 的基础输入及一个覆盖包的五个 GUI Sprite 查询成立；不代表完整 Minecraft 资源系统、资源安全或游戏视觉已完成。

## 实现范围

`src/resources/core.ts` 增加客户端专用途径：仅接受自报 `version.json` 为 1.21.1、resource pack 34 的 JAR，要求 GUI atlas 和五张基础 PNG 存在且可读；不读取或执行 Java 字节码。ZIP 中央目录中的非 assets 条目会被检查名称/标志但不解压，所选 assets 的本地头、描述符、CRC 和实际输出在按需读取时验证；特别跳过原版 `assets/.mcassetsroot` 标记。客户端来源未认证，自报版本不证明官方来源。

`src/resources/layered.ts` 维护一个基础与一个可选覆盖包，替换成功才关闭旧层，失败或取消保留原层；层变化递增 generation，旧异步 sprite 查询标记过期，不设置缓存。普通文件上层优先；图片的 metadata 从覆盖层再到图片层选择，覆盖图片不能继承基础元数据。支持五个固定 ID、基础 GUI atlas 的单个 `directory gui/sprites` source，以及 stretch/tile/nine_slice 元数据；覆盖包含 GUI atlas 定义、filter/overlay、动画及其他 source 均返回或在导入时报告 unsupported。`filtered` 状态保留但并未实现 filter，所以不会把被忽略的 filter 称为已解析。未知 sprite 不假称支持。

`src/ui/ResourceTestPanel.tsx` 提供客户端 JAR、覆盖 ZIP/文件夹、资源路径和 Sprite 查询，显示图片与元数据来源及诊断。选择失败保留旧会话；会话只存在内存，JSON、历史、IndexedDB 不使用资源文件。Panel 素材及渲染代码未修改。

## 真实 JAR 与预算

用户本机 `C:/Users/JuGeLiZizzz/.gradle/caches/neoformruntime/artifacts/minecraft_1.21.1_client.jar`，SHA-256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`，压缩文件 26,836,906 字节；中央目录共 23,519 条，assets 普通文件 8,448 条，声明解压总量 4,804,148 字节。所有 ZIP 条目标志含 data descriptor。原第一批读取器拒绝该 JAR 的两个原因：20,000 条目上限及不支持 descriptor；此外首次真实测试发现 `assets/.mcassetsroot` 不属于命名空间路径，修正为客户端标记例外。

仅客户端 JAR 的条目上限由 20,000 改为 30,000；普通 ZIP 仍 20,000。仅客户端接受 **带签名的 32 位 data descriptor**，每个所读条目核对本地头、签名、中央目录尺寸和 CRC；ZIP64、无签名描述符、加密、多卷及其他方法仍拒绝。输入 128 MiB、中央目录 16 MiB、单文件 16 MiB、声明总量 128 MiB、比率 200:1、JSON 2 MiB、PNG 8192 轴/16,777,216 像素等原策略保留。客户端会话另累计已成功读取的解压字节，超过128 MiB拒绝；每条实际输出也逐块检查。该累计在单文件完成后计入，会先产生最多单文件上限的暂时额外输出，且不限制解压器在返回 chunk 前的内部内存。

Chrome 156.0.8078.48 网页自动选择本机 JAR，仅按需解压 version、GUI atlas、五个 PNG 和相应 metadata；加载加五次查询按条目实际读取次数及 JAR 文件长度核算约 11,683 字节的解压输出，非整个 assets 解压量。五图均 200×20，nine_slice 逻辑 200×20，button/highlighted 的边框 3，disabled/text_field/highlighted 的边框 1。全量回归中载入分别 132 ms / 144 ms（模拟 DPR 1/2，含 Playwright 文件选择，不是设备性能保证）。Chrome `performance.memory.usedJSHeapSize` 在载入前与五次查询后分别约 13.9→22.5 MB / 13.8→22.6 MB；这是粗略 JS 堆快照，含页面其他对象，不是峰值、进程内存、原生解压器内存或 PNG 解码内存。PNG 仅检 signature/IHDR 和尺寸，未完整解码或核验内部结构。真实性、正常用户本地选择器及其他客户端变体仍 OPEN。

## 验证

Windows，Node 24.17.0、npm 11.13.0、Chrome 156.0.8078.48；Playwright 1.56.1、1440×1000、模拟 DPR 1/2。合成 ZIP、伪 PNG 头与元数据由测试代码生成，不含游戏资产。测试覆盖基础/元数据/图片/两者覆盖、边框差异、错误元数据、atlas 不支持、错误路径、取消与失败保留、损坏 descriptor、层切换时异步结果过期，以及第一批安全负例。

- `npm.cmd run typecheck`、`npm.cmd run build` 通过；有既有大 chunk 警告。
- `npm.cmd test` **86/86**，包含原 82 项与本批4项。
- `$env:GUI_BROWSER_CHANNEL='chrome'; $env:GUI_CLIENT_JAR='<本机 JAR 路径>'; npx.cmd playwright test --trace off`：**122/122**，零跳过，两个真实 JAR 查询分别位于两个模拟 DPR 配置；完整原始结果 [resource-layers-results.json](resource-layers-results.json)。未将不同时期的测试相加。用户系统文件选择器及实机资源包覆盖尚未人工验证。
- 首次真实 JAR 测试因 `.mcassetsroot` 被当成资源路径而失败；增加明确例外后，该 JAR 在本次完整回归中两项均通过。两次被中断的实验不视为通过，测试 Vite 进程已清理。

## 仍为 OPEN / PENDING

自实现 ZIP 解析器尚无独立安全审计、恶意归档覆盖不完整；客户端按需读取只验证所选资源的本地头/数据，未验证所有未读取条目与其内容的完整性，亦不保证与未读取非资源条目无交叉重叠。实际累计预算不约束浏览器原生解压器内部峰值；无系统性大文件/低内存设备测试。未知 atlas source、覆盖 atlas、filter/overlay、多层、动画、完整 PNG/字体及原生渲染均未实现。既有 Panel 大尺寸接缝、物理 DPR、真实 IME、浏览器兼容及游戏视觉验证仍 OPEN；现有用户提供的 Panel 素材保持不变，公开分发的后续评估维持原状态。

## 用户人工验证

用户随后反馈：网页端成功导入客户端 JAR，五个 GUI Sprite 查询均成功。此反馈确认其实际操作流程；未提供覆盖包组合、浏览器和设备矩阵，不将结果外推至这些场景，也不关闭上述 OPEN / PENDING。
