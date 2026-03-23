/**
 * driver-claude.ts — Claude CLI agent driver.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { registerDriver } from './agent-driver.js';
import {
// shared helpers
run, agentLog, detectAgentBin, pushRecentActivity, summarizeClaudeToolUse, summarizeClaudeToolResult, IMAGE_EXTS, mimeForExt, listPikiclawSessions, mergeManagedAndNativeSessions, readTailLines, stripInjectedPrompts, roundPercent, modelFamily, normalizeClaudeModelId, emptyUsage, normalizeUsageStatus, } from './code-agent.js';
import { SESSION_RUNNING_THRESHOLD_MS } from './constants.js';

// Store original environment variables
const ORIGINAL_ENV = { ...process.env };

// Function to set environment variables based on model provider
function setupModelEnvironment(model) {
    // Reset to original environment first
    process.env = { ...ORIGINAL_ENV };

    if (model.startsWith('ali-')) {
        // Use Alibaba Cloud environment - compatible with Anthropic interface protocol
        process.env.ANTHROPIC_BASE_URL = 'https://coding.dashscope.aliyuncs.com/apps/anthropic';
        process.env.CLAUDE_MODEL = 'qwen3.5-plus';
        process.env.ANTHROPIC_MODEL = 'qwen3.5-plus';
    } else if (model.startsWith('ark-')) {
        // Use Volcengine environment with credentials from environment - compatible with Anthropic interface protocol
        process.env.ANTHROPIC_API_KEY = process.env.VOLCENGINE_API_KEY || 'YOUR_VOLCENGINE_API_KEY_HERE';
        process.env.ANTHROPIC_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding';
        process.env.CLAUDE_MODEL = 'ark-code-latest';
        process.env.ANTHROPIC_MODEL = 'ark-code-latest';
    }
}
// ---------------------------------------------------------------------------
// Multimodal stdin
// ---------------------------------------------------------------------------
function buildClaudeMultimodalStdin(prompt, attachments) {
    const content = [];
    for (const filePath of attachments) {
        const ext = path.extname(filePath).toLowerCase();
        if (IMAGE_EXTS.has(ext)) {
            try {
                const data = fs.readFileSync(filePath);
                content.push({
                    type: 'image',
                    source: { type: 'base64', media_type: mimeForExt(ext), data: data.toString('base64') },
                });
            }
            catch (e) {
                agentLog(`[attach] failed to read image ${filePath}: ${e.message}`);
            }
        }
        else {
            content.push({ type: 'text', text: `[Attached file: ${filePath}]` });
        }
    }
    content.push({ type: 'text', text: prompt });
    return JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
}
// ---------------------------------------------------------------------------
// Command & parser
// ---------------------------------------------------------------------------
function claudeCmd(o) {
    const args = ['claude', '-p', '--verbose', '--output-format', 'stream-json', '--include-partial-messages'];

    // Map model aliases to actual model IDs based on provider
    let model = normalizeClaudeModelId(o.claudeModel);

    // Setup environment based on model provider
    if (model) {
        setupModelEnvironment(model);
    }

    // Handle custom model mappings for different providers
    if (model) {
        if (model.startsWith('ali-')) {
            // Map ali- prefixed models to actual Aliyun DashScope models
            switch(model) {
                case 'ali-qwen3.5': model = 'qwen3.5-plus'; break;
                case 'ali-qwen-max': model = 'qwen3-max-2026-01-23'; break;
                case 'ali-qwen-coder': model = 'qwen3-coder-plus'; break;
                case 'ali-qwen-next': model = 'qwen3-coder-next'; break;
                case 'ali-kimi': model = 'kimi-k2.5'; break;
                case 'ali-glm-5': model = 'glm-5'; break;
                case 'ali-glm-4.7': model = 'glm-4.7'; break;
                default:
                    // Remove prefix to get actual model ID
                    model = model.substring(4); // Remove 'ali-' prefix
            }
        } else if (model.startsWith('ark-')) {
            // Map ark- prefixed models to actual Volcengine models
            switch(model) {
                case 'ark-code': model = 'ark-code-latest'; break;
                case 'ark-doubao-code': model = 'doubao-seed-code'; break;
                case 'ark-doubao-2.0-code': model = 'doubao-seed-2.0-code'; break;
                case 'ark-doubao-2.0-pro': model = 'doubao-seed-2.0-pro'; break;
                case 'ark-doubao-2.0-lite': model = 'doubao-seed-2.0-lite'; break;
                case 'ark-kimi': model = 'kimi-k2.5'; break;
                case 'ark-minimax': model = 'MiniMax-M2.5'; break;
                case 'ark-deepseek': model = 'deepseek-v3.2'; break;
                default:
                    // Remove prefix to get actual model ID
                    model = model.substring(4); // Remove 'ark-' prefix
            }
        }
        args.push('--model', model);
    }

    if (o.claudePermissionMode)
        args.push('--permission-mode', o.claudePermissionMode);
    if (o.sessionId)
        args.push('--resume', o.sessionId);
    if (o.attachments?.length) {
        args.push('--input-format', 'stream-json');
        o._stdinOverride = buildClaudeMultimodalStdin(o.prompt, o.attachments);
    }
    if (o.thinkingEffort)
        args.push('--effort', o.thinkingEffort);
    if (o.claudeAppendSystemPrompt)
        args.push('--append-system-prompt', o.claudeAppendSystemPrompt);
    if (o.mcpConfigPath)
        args.push('--mcp-config', o.mcpConfigPath);

    // Filter out any existing --model arguments to avoid duplicates
    if (o.claudeExtraArgs?.length) {
        let filteredExtraArgs = [...o.claudeExtraArgs];
        for (let i = 0; i < filteredExtraArgs.length; i++) {
            if (filteredExtraArgs[i] === '--model' && i < filteredExtraArgs.length - 1) {
                // Remove the --model flag and its following argument
                filteredExtraArgs.splice(i, 2);
                i--; // Adjust index after removal
            }
        }
        args.push(...filteredExtraArgs);
    }
    return args;
}
