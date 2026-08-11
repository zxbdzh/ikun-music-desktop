# Apifox 项目 8689463 治理资产

本目录保存 AurioClub API 的可复现治理 payload。所有文件只包含测试占位数据，不得写入真实账号、Bearer、验证码或其他密钥。

## 契约修复

`contracts/` 保存需要完整结构更新的接口 payload。执行更新前必须重新 `endpoint get` 对照远端资源，并通过 `endpoint-create` Schema 校验；`endpoint update` 是 PUT 风格操作，不会按响应 ID 合并数组。

- `contracts/proxy.json`：将 `/proxy` 的 200 主响应修正为 XML 字符串；缺少 URL 的 400 与 502 均继续引用生产响应匹配的 `ProxyError`。HTML、纯文本、二进制等附加媒体类型均保留。
- `contracts/itunes-search.json`：保留 iTunes 搜索的 200/400/429/502 契约，并为原本空名称的 429 响应补充“请求过于频繁”，便于文档和测试报告识别限流分支。

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

## 隔离单接口回归

`test-cases/` 保存 22 条单接口用例的完整 payload：18 条成功路径，以及 `/auth/me` 无 Bearer、`/sync/pull` 无 Bearer、`/proxy` 缺少 URL、iTunes 限流共 4 条安全或边界路径。

`mock-server.mjs` 只读取本目录的固定 Mock payload，并监听 `127.0.0.1:48765`。`environment-cli-mock.json` 将 Apifox 的 `default`、`core`、`edge` 三个服务映射到该服务器；项目中的对应环境名为“AurioClub CLI 隔离 Mock”。隔离限流使用 `term=__rate_limit__`，不会依赖或消耗生产 iTunes 配额。

```powershell
node docs/apifox/8689463/mock-server.mjs
apifox cli-schema validate environment-update --file docs/apifox/8689463/environment-cli-mock.json
apifox test-case run <caseId> --project 8689463 --environment <environmentId> --global-var "JWT_TOKEN=mock-token" --reporters json --out-dir <temporaryReportDir>
```

用例已存在于远端，不能批量重复 `create`。维护单条用例时必须执行 `test-case get -> cli-schema validate test-case-update -> test-case update -> test-case get`，并在隔离环境重新运行。

2026-08-12 阶段验收：22 份 JSON 报告均可解析，22/22 步骤、22/22 请求和 60/60 断言通过，失败项与运行时错误均为 0；报告中的 22 个请求目标全部为 `127.0.0.1`。Apifox JSON 报告会包含 CLI 运行上下文和访问凭据快照，只能存放在临时目录，汇总后必须删除，禁止提交。

## 全接口契约回归场景

`test-scenarios/full-contract-regression.create.json` 是场景元数据创建 payload；`full-contract-regression.imports.json` 固化 18 组接口与 22 条源用例 ID 的导入清单。远端场景名为“AurioClub 全接口契约回归”。Apifox 创建场景时不会保存 `steps`，因此必须先创建元数据，再按清单逐组执行 `import-steps --source test-case --sync manual`。

```powershell
apifox cli-schema validate test-scenario-create --file docs/apifox/8689463/test-scenarios/full-contract-regression.create.json
apifox test-scenario create --project 8689463 --file docs/apifox/8689463/test-scenarios/full-contract-regression.create.json
apifox test-scenario import-steps <scenarioId> --project 8689463 --source test-case --endpoint <endpointId> --ids "<caseId[,caseId]>" --sync manual
apifox test-scenario get <scenarioId> --project 8689463 --with-case-detail
apifox test-scenario run <scenarioId> --project 8689463 --environment <environmentId> --global-var "JWT_TOKEN=mock-token" --reporters json --out-dir <temporaryReportDir>
```

2026-08-12 场景验收：回读得到 22 个启用的 HTTP 步骤，编号 1–22 唯一连续，覆盖 18 个接口并保留 60 个断言；隔离运行 22/22 步骤、22/22 请求和 60/60 断言通过，0 失败、0 运行时错误、0 个非本机请求。
