# 图派在线演示版

此目录是独立的 Vercel 静态网站，不运行项目根目录的 server.mjs。

在仓库根目录执行 `node scripts/build-demo.mjs` 同步共用页面并生成 public/。提交前运行 `node scripts/build-demo.mjs --check` 检查生成文件是否与源码一致。

Vercel 项目的 Root Directory 设置为 `demo`，框架为 Other，输出目录 public，无构建与安装命令。也可使用 CLI 在 demo 目录中关联原有项目并部署。

交互全部使用内存中的示例数据，刷新或重置后恢复，不读取真实文件夹、不接收真实 Key，也不调用 RunningHub。页面清晰标注模拟状态。
