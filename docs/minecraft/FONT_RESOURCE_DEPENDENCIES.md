# 字体资源依赖与只读实验

本机用户提供的 `minecraft_1.21.1_client.jar` SHA-256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`；version.json 自报 1.21.1 / format 34，不是官方来源认证。未复制字体图片或游戏资源进项目。

| 资源 | 本机观察 | 意义 |
|---|---|---|
| `assets/minecraft/font/default.json` | 引用 include/space、include/default（uniform=false）、include/unifont | 需解析引用和条件，而非只取一个文件 |
| `assets/minecraft/font/include/space.json` | 空格 U+0020 advance 4；U+200C advance 0 | 纯度量 provider |
| `assets/minecraft/font/include/default.json` | 依次列出 nonlatin_european、accented、ascii bitmap | bitmap 资源与 provider 顺序均重要 |
| `assets/minecraft/textures/font/ascii.png` | 128×128；定义 16×16 网格、height 8、ascent 7 | 样本 A/a/W/0 扫描宽 5、advance 6；i/!/. /, 扫描宽 1、advance 2 |
| `assets/minecraft/font/include/unifont.json` | providers 为空 | 此 JAR 内该定义未提供 unihex 字体；不证明游戏运行时中文缺失 |
| JAR `assets/minecraft/font/` 中的 ZIP、HEX、TTF | 未发现 | launcher 外部资产、资源包或其他运行时来源仍需调查 |

`tests/font-resource-audit.spec.ts` 在现有用户 JAR 输入和资源 session 上定位 JSON、读取 ASCII PNG 并用浏览器 `createImageBitmap` 解码；Chrome 模拟 DPR 1/2 均通过。另以内存只读扫描像素，未保存图片。现有资源模块支持受限单文件查询，不实现完整字体定义栈、reference、filter 或字体 provider。嵌套 unihex ZIP 的安全预算亦未授权扩大。缺失/不支持必须显式诊断；不能以当前实验宣称完整字体资源解析。
