# Pikiclaw - Multi-Provider Support

This fork of [pikiclaw](https://github.com/xiaotonng/pikiclaw) includes enhanced multi-provider support for AI models.

## 新增功能

### 多API提供商支持
- 支持阿里云 DashScope (兼容 Anthropic 接口协议)
- 支持火山引擎 (兼容 Anthropic 接口协议)

### 模型前缀系统
- 使用 `ali-` 前缀访问阿里云模型: `ali-qwen3.5`, `ali-qwen-max`, `ali-qwen-coder` 等
- 使用 `ark-` 前缀访问火山引擎模型: `ark-code`, `ark-doubao-code`, `ark-kimi` 等

### API 配置

要使用此增强版本，您需要配置环境变量:

```bash
# For Alibaba Cloud
export ANTHROPIC_API_KEY='your-ali-cloud-api-key'
export ANTHROPIC_BASE_URL='https://coding.dashscope.aliyuncs.com/apps/anthropic'

# For VolcEngine (if using ark- prefixed models)
export VOLCENGINE_API_KEY='your-volcengine-api-key'
```

## 主要改动

1. 在 `driver-claude.ts` 中添加了 `setupModelEnvironment()` 函数
2. 实现了基于模型前缀的动态API路由
3. 添加了对阿里云和火山引擎模型的映射支持
4. 修复了重复模型参数的问题

## 安全提醒

- 请勿在代码中硬编码API密钥
- 使用环境变量管理敏感信息
- 本分支中的 `.bak` 文件仅为配置参考模板
