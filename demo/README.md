# 图派在线演示版

此目录是独立的 Vercel 静态网站，不运行项目根目录的 server.mjs。

在仓库根目录执行 `node scripts/build-demo.mjs` 同步共用页面并生成 public/。提交前运行 `node scripts/build-demo.mjs --check` 检查生成文件是否与源码一致。

Vercel 项目的 Root Directory 设置为 `demo`，框架为 Other，输出目录 public，无构建与安装命令。也可使用 CLI 在 demo 目录中关联原有项目并部署。

演示目录通过独立 `package.json` 将 Node.js 固定为 `24.x`，与现有 Vercel 项目设置一致，避免根目录 `>=22` 被平台解释为最新主版本并覆盖项目设置。此设置只影响演示部署，不改变 Windows 本地版的 Node.js 22+ 要求。旧部署记录不可修改，新提交部署成功后查看新的 Deployment Settings。

交互全部使用内存中的示例数据，刷新或重置后恢复，不读取真实文件夹、不接收真实 Key，也不调用 RunningHub。页面清晰标注模拟状态。
