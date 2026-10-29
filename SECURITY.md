# 安全反馈

请勿在公开 Issue 或 Pull Request 中提交 API Key、`.local/` 数据、客户图片或可被直接利用的敏感细节。

如果发现凭据泄露、越界文件读写或本地接口访问问题，请通过仓库的 **Security → Advisories → Report a vulnerability** 私密报告（若仓库已启用）。如入口不可用，可先创建不含敏感细节的 Issue，请维护者提供私密沟通方式。

程序只应在本机使用，不应直接向公网暴露服务端口。API Key 和本地加密密钥同存于 `.local/`，请勿分享该目录。
