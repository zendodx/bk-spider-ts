/**
 * 通用 AI 客户端（OpenAI 兼容接口）
 *
 * 统一管理系统设置中配置的 AI 服务（默认阿里云百炼 DashScope），
 * 供验证码识别、数据分析等各类 AI 功能复用。
 *
 * 配置优先级：调用方 overrides > settings.json（系统设置页）> 环境变量 > 默认值。
 * 每次调用都会重新读取 settings.json，在系统设置页修改配置后无需重启即生效。
 *
 * 配置项（系统设置页字段 / 环境变量）：
 *   qwenApiKey  / QWEN_API_KEY / DASHSCOPE_API_KEY  # API Key
 *   qwenModel   / QWEN_VL_MODEL                     # 模型（默认 qwen-vl-max-latest）
 *   qwenBaseUrl / QWEN_BASE_URL                     # 接口地址（默认 DashScope 兼容模式）
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SETTINGS_FILE = path.join(os.homedir(), 'bk_spider_data', 'settings.json');

export const DEFAULT_AI_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DEFAULT_AI_MODEL = 'qwen-vl-max-latest';

// 模型预设与前端共享（见 src/lib/ai/presets.ts，纯数据无 Node 依赖）
export { QWEN_VL_MODEL_PRESETS } from './presets';

/** 单次调用级配置覆盖（优先级最高） */
export interface AiConfigOverrides {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export interface AiConfig {
  apiKey: string | null;
  baseURL: string;
  model: string;
}

/** 读取 settings.json（不存在/损坏时返回空对象） */
export function readSavedSettings(): Record<string, unknown> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch {
    // 设置文件损坏时静默降级
  }
  return {};
}

function pick(...candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    if (c) return c; // 跳过 undefined 和空字符串
  }
  return null;
}

/**
 * 解析 AI 配置，优先级：overrides > settings.json > 环境变量 > 默认值。
 * 每次调用重新读取 settings.json，改设置后无需重启。
 */
export function resolveAiConfig(overrides: AiConfigOverrides = {}): AiConfig {
  const saved = readSavedSettings() as Record<string, string>;
  return {
    apiKey: pick(
      overrides.apiKey,
      saved.qwenApiKey,
      process.env.QWEN_API_KEY,
      process.env.DASHSCOPE_API_KEY
    ),
    baseURL:
      pick(overrides.baseURL, saved.qwenBaseUrl, process.env.QWEN_BASE_URL) ?? DEFAULT_AI_BASE_URL,
    model: pick(overrides.model, saved.qwenModel, process.env.QWEN_VL_MODEL) ?? DEFAULT_AI_MODEL,
  };
}

/** 是否已配置 API Key（不代表功能开关，仅表示凭证可用） */
export function hasAiApiKey(overrides: AiConfigOverrides = {}): boolean {
  return !!resolveAiConfig(overrides).apiKey;
}

export type AiContent =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string };

export interface AiCallOptions {
  maxTokens?: number;
  /** 请求超时毫秒数（默认 30s） */
  timeoutMs?: number;
  /** 单次调用级配置覆盖 */
  overrides?: AiConfigOverrides;
}

export interface AiCallResult {
  text: string;
  latencyMs: number;
}

/** 通用调用：发送图文混合内容，返回模型原始文本与耗时 */
export async function callAi(content: AiContent[], options: AiCallOptions = {}): Promise<AiCallResult> {
  const { apiKey, baseURL, model } = resolveAiConfig(options.overrides);
  if (!apiKey) {
    throw new Error('未配置 AI API Key（请在系统设置页填写，或设置 QWEN_API_KEY 环境变量）');
  }

  const reqStart = Date.now();
  const resp = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
    body: JSON.stringify({
      model,
      temperature: 0,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      messages: [{ role: 'user', content }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    // 提取 DashScope/OpenAI 风格的错误信息
    let detail = body.slice(0, 200);
    try {
      const errObj = JSON.parse(body);
      detail = errObj.error?.message || errObj.message || detail;
    } catch {
      // 保留原始文本
    }
    throw new Error(`AI 请求失败 HTTP ${resp.status}: ${detail}`);
  }

  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return {
    text: data.choices?.[0]?.message?.content?.trim() ?? '',
    latencyMs: Date.now() - reqStart,
  };
}

/** 便捷方法：纯文本调用 */
export async function callAiText(prompt: string, options: AiCallOptions = {}): Promise<AiCallResult> {
  return callAi([{ type: 'text', text: prompt }], options);
}

/** 便捷方法：单张 JPEG（base64）+ 文本的视觉调用 */
export async function callAiVision(
  base64Jpeg: string,
  prompt: string,
  options: AiCallOptions = {}
): Promise<AiCallResult> {
  return callAi(
    [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
      { type: 'text', text: prompt },
    ],
    options
  );
}

/**
 * 连通性测试：发送一条纯文本消息，验证 API Key / 模型 / 接口地址是否可用。
 * @returns success + 可读的结果描述（含延迟与模型回复或错误详情）
 */
export async function testAiConnection(
  overrides: AiConfigOverrides = {}
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const { apiKey, model } = resolveAiConfig(overrides);
  if (!apiKey) {
    return { success: false, message: '未配置 API Key，请先填写后再测试' };
  }

  try {
    const { text, latencyMs } = await callAiText('请只回复两个字：正常', {
      maxTokens: 16,
      overrides,
    });
    const reply = text || '(空回复)';
    return {
      success: true,
      latencyMs,
      message: `连通成功，模型「${model}」响应 ${latencyMs}ms，回复：${reply.slice(0, 30)}`,
    };
  } catch (e) {
    return {
      success: false,
      message: `${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
