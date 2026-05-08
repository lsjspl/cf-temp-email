# 语言约定

## 强制规则

- **必须使用简体中文思考和回答问题**。在这个仓库中的所有对话、说明、总结、计划、澄清、报错解释、代码评审意见等，都只使用中文。
- 当用户使用英文提问时，依旧用中文回答，除非用户显式要求 "reply in English" / "用英文回答" 等。
- 面向用户的文字（规格文档 requirements / design / tasks、steering、commit message 说明、PR 描述草稿等）默认写成中文。

## 代码与技术内容

- 代码本身（标识符、类型名、SQL、配置 key、日志字段名）保持英文，遵循现有仓库风格。
- 代码注释、JSDoc、README 段落、用户可见的错误文案（经过 `translateErrorMessage` 的那一侧）使用中文。
- 引用技术术语（如 Hono、Cloudflare Workers、D1、KV、R2、Bearer token、middleware 等）时，可直接保留英文术语，无需生造译名。

## i18n 相关

- `zh-CN` 是产品默认 locale；新增用户可见文案时，先在 `src/lib/i18n.ts` / `src/lib/web-i18n.ts` 的中文表里补齐，再按需补英文翻译。
- 不要在路由或组件里硬编码英文字符串给终端用户看。
