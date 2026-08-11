# Apifox 项目 8689463 治理资产

本目录保存 AurioClub API 的可复现治理 payload。所有文件只包含测试占位数据，不得写入真实账号、Bearer、验证码或其他密钥。

## 契约修复

`contracts/` 保存需要完整结构更新的接口 payload。执行更新前必须重新 `endpoint get` 对照远端资源，并通过 `endpoint-create` Schema 校验；`endpoint update` 是 PUT 风格操作，不会按响应 ID 合并数组。

- `contracts/proxy.json`：将 `/proxy` 的 200 主响应修正为 XML 字符串，并按生产实测将缺少 URL 的 400 响应修正为空体；HTML、纯文本、二进制等附加媒体类型以及 502 错误 Schema 均保留。

## Mock

`mocks/*-success.json` 是 `mock create` payload，覆盖项目 `main` 分支的 18 个 HTTP 接口，每个接口恰好一个默认成功期望。

- JSON 接口返回符合现有成功响应 Schema 的最小代表性数据。
- `POST /track` 返回 `204` 和空响应体。
- `GET /proxy` 返回 RSS 文本，单集同时包含原始文章链接和音频 enclosure，用于验证博客长内容分享及音频回退。
- 所有固定文本均关闭 Mock.js 和模板替换，保证回归结果可复现。

这些文件不是幂等更新：重复执行 `create` 会新增重复期望。写入前必须先查询远端状态并按 `apiDetailId` 去重。

```powershell
apifox mock list --project 8689463 --branch main
apifox cli-schema get mock-create
apifox cli-schema validate mock-create --file <payload>
apifox mock create --project 8689463 --branch main --file <payload>
apifox mock get <mockId> --project 8689463 --branch main
```

阶段验收标准：接口数、Mock 数和唯一 `apiDetailId` 数均为 18，且缺失、越界和重复覆盖均为 0。
