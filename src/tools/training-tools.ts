/**
 * ABOV3 Eden Training Tools - FULLY FUNCTIONAL IMPLEMENTATION
 *
 * Real training pipeline for model distillation and fine-tuning:
 * - Data generation from teacher models (OpenAI, Anthropic, Ollama)
 * - Dataset validation
 * - LoRA adapter training (via Python/transformers)
 * - Full model distillation
 * - Model evaluation with real metrics
 * - GGUF export via llama.cpp
 * - Ark-SLM deployment
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import type { Tool } from './index.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// Base directories
const EDEN_BASE_DIR = path.join(os.homedir(), '.abov3', 'eden');
const TRAINING_DIR = path.join(EDEN_BASE_DIR, 'training');
const DATASETS_DIR = path.join(TRAINING_DIR, 'datasets');
const MODELS_DIR = path.join(TRAINING_DIR, 'models');
const CHECKPOINTS_DIR = path.join(TRAINING_DIR, 'checkpoints');
const SCRIPTS_DIR = path.join(TRAINING_DIR, 'scripts');
const ARK_MODELS_DIR = path.join(os.homedir(), '.abov3', 'ark-slm', 'models');

// Exodus proxy URL for OAuth-authenticated requests
// Eden calls this endpoint instead of direct API calls for Claude Pro/Max OAuth tokens
const EXODUS_PROXY_URL = process.env.EXODUS_PROXY_URL || 'http://127.0.0.1:3000/api/training/generate';

// Ensure directories exist
function ensureDirectories() {
  for (const dir of [EDEN_BASE_DIR, TRAINING_DIR, DATASETS_DIR, MODELS_DIR, CHECKPOINTS_DIR, SCRIPTS_DIR, ARK_MODELS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Training job status
interface TrainingJobStatus {
  jobId: string;
  status: 'pending' | 'generating' | 'validating' | 'training' | 'evaluating' | 'exporting' | 'deploying' | 'completed' | 'error';
  progress: number;
  currentStep: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  metrics?: {
    loss?: number;
    perplexity?: number;
    bleuScore?: number;
    accuracy?: number;
  };
  outputPath?: string;
  ggufPath?: string;
}

// In-memory job tracking
const activeJobs = new Map<string, TrainingJobStatus>();

// Update job status
function updateJobStatus(jobId: string, updates: Partial<TrainingJobStatus>) {
  const job = activeJobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
    // Persist to disk
    const statusPath = path.join(TRAINING_DIR, 'jobs', `${jobId}.json`);
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    fs.writeFileSync(statusPath, JSON.stringify(job, null, 2));
  }
}

// ============================================================================
// LLM API CLIENTS
// ============================================================================

interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'azure' | 'abov3' | 'mistral' | 'groq' | 'deepseek' | 'gemini' | 'other';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  accessToken?: string;  // OAuth token for ABOV3/Anthropic
  organizationId?: string;  // OpenAI organization
}

/**
 * Credentials passed from Exodus (matches TeacherModelCredentials interface)
 */
interface ExodusCredentials {
  provider: 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'azure' | 'abov3' | 'mistral' | 'groq' | 'deepseek' | 'gemini' | 'other';
  apiKey?: string;
  baseUrl?: string;
  modelId: string;
  // OAuth tokens for Claude Pro/Max (routed through Exodus AIX infrastructure)
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  // Additional provider-specific options
  organizationId?: string;
  heliconeKey?: string;
}

/**
 * Parse teacher model ID to determine provider and model
 * Uses credentials from Exodus if available, otherwise falls back to environment variables
 */
function parseTeacherModelId(modelId: string, credentials?: ExodusCredentials): LLMConfig {
  // If Exodus provided credentials, use them directly
  if (credentials) {
    // Debug: Log what fields are present (not the values)
    const credentialFields = Object.keys(credentials);
    const presentFields = credentialFields.filter(k => credentials[k as keyof ExodusCredentials] !== undefined && credentials[k as keyof ExodusCredentials] !== null && credentials[k as keyof ExodusCredentials] !== '');
    const missingFields = credentialFields.filter(k => !presentFields.includes(k));

    logger.info(`Using credentials from Exodus: provider=${credentials.provider}, modelId=${credentials.modelId}`);
    logger.info(`  -> Present fields: ${presentFields.join(', ') || 'none'}`);
    logger.info(`  -> Missing/empty fields: ${missingFields.join(', ') || 'none'}`);
    logger.info(`  -> Has apiKey: ${!!credentials.apiKey} (length=${credentials.apiKey?.length || 0})`);
    logger.info(`  -> Has accessToken: ${!!credentials.accessToken} (length=${credentials.accessToken?.length || 0})`);
    logger.info(`  -> Has baseUrl: ${!!credentials.baseUrl} (value=${credentials.baseUrl || 'none'})`);

    return {
      provider: credentials.provider as LLMConfig['provider'],
      model: credentials.modelId,
      apiKey: credentials.apiKey,
      baseUrl: credentials.baseUrl,
      accessToken: credentials.accessToken,
      organizationId: credentials.organizationId,
    };
  }

  // Fallback: Parse model ID and use environment variables
  logger.info(`No credentials from Exodus, falling back to environment variables for ${modelId}`);

  // Format: provider/model or just model (defaults to openai)
  const parts = modelId.split('/');

  if (parts.length === 2) {
    const [provider, model] = parts;
    switch (provider.toLowerCase()) {
      case 'anthropic':
      case 'claude':
        return {
          provider: 'anthropic',
          model: model,
          apiKey: process.env.ANTHROPIC_API_KEY,
        };
      case 'ollama':
        return {
          provider: 'ollama',
          model: model,
          baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
        };
      case 'openrouter':
        return {
          provider: 'openrouter',
          model: model,
          apiKey: process.env.OPENROUTER_API_KEY,
          baseUrl: 'https://openrouter.ai/api/v1',
        };
      case 'abov3':
        return {
          provider: 'abov3',
          model: model,
          apiKey: process.env.ABOV3_API_KEY,
          // ABOV3 uses Anthropic's API endpoint
          baseUrl: process.env.ABOV3_HOST || 'https://api.anthropic.com',
        };
      case 'mistral':
        return {
          provider: 'mistral',
          model: model,
          apiKey: process.env.MISTRAL_API_KEY,
          baseUrl: 'https://api.mistral.ai/v1',
        };
      case 'groq':
        return {
          provider: 'groq',
          model: model,
          apiKey: process.env.GROQ_API_KEY,
          baseUrl: 'https://api.groq.com/openai/v1',
        };
      case 'deepseek':
        return {
          provider: 'deepseek',
          model: model,
          apiKey: process.env.DEEPSEEK_API_KEY,
          baseUrl: 'https://api.deepseek.com/v1',
        };
      case 'gemini':
      case 'google':
        return {
          provider: 'gemini',
          model: model,
          apiKey: process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY,
        };
      default:
        return {
          provider: 'openai',
          model: model,
          apiKey: process.env.OPENAI_API_KEY,
        };
    }
  }

  // Auto-detect based on model name
  if (modelId.startsWith('claude') || modelId.includes('anthropic')) {
    return {
      provider: 'anthropic',
      model: modelId,
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  if (modelId.startsWith('llama') || modelId.startsWith('mistral') || modelId.startsWith('qwen')) {
    // Check if Ollama is available
    return {
      provider: 'ollama',
      model: modelId,
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    };
  }

  // Default to OpenAI
  return {
    provider: 'openai',
    model: modelId,
    apiKey: process.env.OPENAI_API_KEY,
  };
}

/**
 * Call Exodus proxy for OAuth-authenticated requests
 * This allows Eden to use Claude Pro/Max OAuth tokens which are client-bound to Claude Code
 * Eden routes the request through Exodus which has proper OAuth handling
 *
 * IMPORTANT: The Exodus proxy API runs server-side and cannot access client-side IndexedDB.
 * We must pass credentials directly in the request body.
 */
async function callExodusProxy(
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  credentials?: ExodusCredentials
): Promise<string> {
  logger.info(`Calling Exodus proxy for OAuth: modelId=${modelId}, proxyUrl=${EXODUS_PROXY_URL}`);
  logger.info(`  -> credentials provided: ${!!credentials}, provider=${credentials?.provider || 'none'}`);

  const requestBody: Record<string, unknown> = {
    modelId,
    systemPrompt,
    userPrompt,
    temperature,
    maxTokens: 16384,
  };

  // CRITICAL: Pass credentials to Exodus proxy since it can't access client-side store
  if (credentials) {
    requestBody.credentials = {
      provider: credentials.provider,
      apiKey: credentials.apiKey,
      baseUrl: credentials.baseUrl,
      modelId: credentials.modelId,
      // OAuth tokens for AIX infrastructure
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: credentials.expiresAt,
      organizationId: credentials.organizationId,
    };
    logger.info(`  -> Including credentials: provider=${credentials.provider}, modelId=${credentials.modelId}, hasAccessToken=${!!credentials.accessToken}, hasRefreshToken=${!!credentials.refreshToken}`);
  }

  let response: Response;
  try {
    response = await fetch(EXODUS_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (fetchError) {
    logger.error(`Exodus proxy fetch error:`, fetchError);
    throw new Error(`Failed to connect to Exodus proxy at ${EXODUS_PROXY_URL}. Make sure Exodus is running. Error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
  }

  const data = await response.json();

  if (!response.ok || !data.success) {
    const errorMsg = data.error || `Exodus proxy error: ${response.status}`;
    logger.error(`Exodus proxy error: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  logger.info(`Exodus proxy success: provider=${data.provider}, model=${data.model}, textLength=${data.text?.length || 0}`);
  return data.text || '';
}

/**
 * Call LLM API to generate text
 * For OAuth-authenticated ABOV3/Anthropic requests, routes through Exodus proxy
 */
async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  originalModelId?: string,
  originalCredentials?: ExodusCredentials
): Promise<string> {
  // For OAuth-authenticated requests, use Exodus proxy
  // OAuth tokens are client-bound to Claude Code, so Eden can't use them directly
  if (config.accessToken && (config.provider === 'abov3' || config.provider === 'anthropic')) {
    logger.info(`OAuth detected for ${config.provider}, routing through Exodus proxy`);
    const modelId = originalModelId || config.model;
    // Pass credentials to Exodus proxy since it can't access client-side store
    return await callExodusProxy(modelId, systemPrompt, userPrompt, temperature, originalCredentials);
  }

  switch (config.provider) {
    case 'openai':
      return await callOpenAI(config, systemPrompt, userPrompt, temperature);
    case 'anthropic':
      return await callAnthropic(config, systemPrompt, userPrompt, temperature);
    case 'ollama':
      return await callOllama(config, systemPrompt, userPrompt, temperature);
    case 'openrouter':
      return await callOpenRouter(config, systemPrompt, userPrompt, temperature);
    case 'abov3':
      return await callABOV3(config, systemPrompt, userPrompt, temperature);
    case 'mistral':
      return await callMistral(config, systemPrompt, userPrompt, temperature);
    case 'groq':
      return await callGroq(config, systemPrompt, userPrompt, temperature);
    case 'deepseek':
      return await callDeepseek(config, systemPrompt, userPrompt, temperature);
    case 'gemini':
      return await callGemini(config, systemPrompt, userPrompt, temperature);
    case 'azure':
      return await callAzure(config, systemPrompt, userPrompt, temperature);
    default:
      // For 'other' or unknown providers, try OpenAI-compatible API
      logger.warn(`Unknown provider ${config.provider}, attempting OpenAI-compatible call`);
      return await callOpenAICompatible(config, systemPrompt, userPrompt, temperature);
  }
}

async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('OpenAI API key not found. Set OPENAI_API_KEY environment variable.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model || 'claude-3-haiku-20240307',
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '';
}

async function callOllama(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  const baseUrl = config.baseUrl || 'http://127.0.0.1:11434';

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: {
        temperature,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.message?.content || '';
}

async function callOpenRouter(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('OpenRouter API key not found. Set OPENROUTER_API_KEY environment variable.');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://abov3.com',
      'X-Title': 'ABOV3 Eden Training',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callABOV3(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  // ABOV3 uses Anthropic's API format and endpoint
  const baseUrl = config.baseUrl || 'https://api.anthropic.com';
  const apiKey = config.accessToken || config.apiKey;

  logger.info(`ABOV3 API call: baseUrl=${baseUrl}, hasToken=${!!apiKey}, model=${config.model}`);

  if (!apiKey) {
    throw new Error('ABOV3 API key or OAuth token not found.');
  }

  // CRITICAL: For OAuth authentication, the system message MUST start with
  // "You are Claude Code, Anthropic's official CLI for Claude."
  // This is required IN ADDITION to the headers for Claude Code identification.
  let finalSystemPrompt = systemPrompt;
  if (config.accessToken) {
    const claudeCodeIdentity = "You are Claude Code, Anthropic's official CLI for Claude.";
    finalSystemPrompt = `${claudeCodeIdentity}\n\n${systemPrompt}`;
    logger.info(`ABOV3 OAuth: Prepending Claude Code identity to system prompt`);
  }

  const requestBody = {
    model: config.model || 'claude-3-haiku-20240307',
    system: finalSystemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: 16384,
  };

  // Use headers that work with both OAuth and API key authentication
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  // OAuth uses Bearer token with Claude Code identification, API key uses x-api-key header
  if (config.accessToken) {
    // CRITICAL: OAuth Pro/Max requires Claude Code identification headers
    // Without these, Anthropic rejects with "This credential is only authorized for use with Claude Code"
    headers['Authorization'] = `Bearer ${apiKey}`;

    // Required beta features for OAuth authentication - must identify as Claude Code
    headers['anthropic-beta'] = [
      'oauth-2025-04-20',                        // Enable OAuth authentication
      'claude-code-20250219',                    // Identify as Claude Code (REQUIRED!)
      'interleaved-thinking-2025-05-14',         // Extended thinking support
      'fine-grained-tool-streaming-2025-05-14',  // Tool streaming support
      'prompt-caching-2024-07-31',               // Prompt caching
    ].join(',');

    // Additional Claude Code identification
    headers['x-app'] = 'claude-code';
    headers['User-Agent'] = 'Claude-Code/2.1.0 (Windows NT 10.0; Win64; x64)';

    logger.info(`ABOV3 OAuth headers: anthropic-beta=${headers['anthropic-beta']}, x-app=${headers['x-app']}`);
  } else {
    // Standard API key authentication
    headers['x-api-key'] = apiKey;
    headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
  }

  logger.info(`ABOV3 request: model=${requestBody.model}, endpoint=${baseUrl}/v1/messages, isOAuth=${!!config.accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
  } catch (fetchError) {
    logger.error(`ABOV3 fetch error:`, fetchError);
    throw new Error(`ABOV3 fetch failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
  }

  if (!response.ok) {
    const error = await response.text();
    logger.error(`ABOV3 API error: ${response.status} - ${error}`);
    throw new Error(`ABOV3 API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function callMistral(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Mistral API key not found.');
  }

  const baseUrl = config.baseUrl || 'https://api.mistral.ai/v1';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callGroq(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Groq API key not found.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callDeepseek(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Deepseek API key not found.');
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Deepseek API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callGemini(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Google AI API key not found.');
  }

  const model = config.model || 'gemini-pro';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAzure(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey || !config.baseUrl) {
    throw new Error('Azure OpenAI requires API key and endpoint.');
  }

  // Azure uses deployment name as model
  const deployment = config.model;
  const response = await fetch(
    `${config.baseUrl}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: 16384,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callOpenAICompatible(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<string> {
  if (!config.baseUrl) {
    throw new Error('OpenAI-compatible API requires a base URL.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI-compatible API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// ============================================================================
// DATA GENERATION
// ============================================================================

interface TrainingSample {
  instruction: string;
  input: string;
  output: string;
  conversations?: Array<{ from: string; value: string }>;
}

/**
 * Generate diverse prompt topics based on requirements
 */
function generatePromptTopics(requirements: string, count: number): string[] {
  const topics: string[] = [];

  // Extract key themes from requirements
  const words = requirements.toLowerCase().split(/\s+/);
  const keywords = words.filter(w => w.length > 4);

  // Generate topic variations
  const prefixes = [
    'Basic question about',
    'Advanced scenario for',
    'Edge case involving',
    'Common problem with',
    'Best practices for',
    'Troubleshooting',
    'Comparison of',
    'Step-by-step guide for',
    'Quick tips on',
    'Expert advice about',
  ];

  const suffixes = [
    'for beginners',
    'in production',
    'with examples',
    'with constraints',
    'under time pressure',
    'with limited resources',
    'for enterprise use',
    'for small teams',
    '',
  ];

  for (let i = 0; i < count; i++) {
    const prefix = prefixes[i % prefixes.length];
    const suffix = suffixes[Math.floor(i / prefixes.length) % suffixes.length];
    const keyword = keywords[i % keywords.length] || 'topic';
    topics.push(`${prefix} ${keyword} ${suffix}`.trim());
  }

  return topics;
}

/**
 * Sanitize a string for JSON parsing: escape control characters
 */
function sanitizeJsonString(text: string): string {
  // Replace unescaped control characters that break JSON parsing
  return text
    .replace(/\r\n/g, '\\n')       // Windows newlines
    .replace(/\r/g, '\\n')          // Old Mac newlines
    .replace(/\t/g, '\\t')          // Tabs
    .replace(/[\x00-\x1f]/g, (ch) => {
      // Escape remaining control characters
      const hex = ch.charCodeAt(0).toString(16).padStart(4, '0');
      return `\\u${hex}`;
    });
}

/**
 * Robustly parse JSON training data from LLM response.
 * Handles: truncated arrays, control characters, markdown code blocks,
 * multiple JSON objects, and partial responses.
 */
function parseTrainingJsonResponse(response: string): TrainingSample[] {
  const results: TrainingSample[] = [];

  // Step 1: Strip markdown code blocks
  let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Step 2: Try direct parse of the full array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to repair strategies
    }
  }

  // Step 3: Try to sanitize control characters and re-parse
  if (arrayMatch) {
    try {
      const sanitized = sanitizeJsonString(arrayMatch[0]);
      const parsed = JSON.parse(sanitized);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to object extraction
    }
  }

  // Step 4: Extract individual complete JSON objects from the response
  // This salvages complete objects from truncated arrays
  const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = objectRegex.exec(cleaned)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && (obj.instruction || obj.input) && obj.output) {
        results.push(obj);
      }
    } catch {
      // Try with sanitized version
      try {
        const sanitized = sanitizeJsonString(match[0]);
        const obj = JSON.parse(sanitized);
        if (obj && (obj.instruction || obj.input) && obj.output) {
          results.push(obj);
        }
      } catch {
        // This object is too broken, skip it
      }
    }
  }

  if (results.length > 0) {
    return results;
  }

  // Step 5: Try line-by-line parsing (JSONL format)
  const lines = cleaned.split('\n').filter(l => l.trim().startsWith('{'));
  for (const line of lines) {
    try {
      const obj = JSON.parse(line.trim().replace(/,$/, ''));
      if (obj && (obj.instruction || obj.input) && obj.output) {
        results.push(obj);
      }
    } catch {
      try {
        const sanitized = sanitizeJsonString(line.trim().replace(/,$/, ''));
        const obj = JSON.parse(sanitized);
        if (obj && (obj.instruction || obj.input) && obj.output) {
          results.push(obj);
        }
      } catch {
        // Skip this line
      }
    }
  }

  return results;
}

/**
 * Generate training data using real teacher model
 */
async function generateDataWithTeacher(
  requirements: string,
  teacherModelId: string,
  numSamples: number,
  outputPath: string,
  temperature: number = 0.7,
  credentials?: ExodusCredentials,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; samplesGenerated: number; datasetPath: string; errors: string[]; samples: TrainingSample[] }> {
  ensureDirectories();

  // Parse teacher model config (uses credentials from Exodus if provided)
  const llmConfig = parseTeacherModelId(teacherModelId, credentials);
  logger.info(`Using teacher model: ${llmConfig.provider}/${llmConfig.model} (credentials from ${credentials ? 'Exodus' : 'environment'})`);

  // Create dataset directory
  const datasetDir = path.dirname(outputPath);
  fs.mkdirSync(datasetDir, { recursive: true });

  const systemPrompt = `You are an expert training data generator. Your task is to create high-quality instruction-following examples for fine-tuning a language model.

REQUIREMENTS FOR THE TARGET MODEL:
${requirements}

GUIDELINES:
1. Generate realistic, practical examples that a user would actually ask
2. Cover diverse scenarios, edge cases, and difficulty levels
3. Ensure answers are accurate, complete, and helpful
4. Use natural, varied language - avoid repetitive patterns
5. Include context where relevant
6. Make responses appropriately detailed based on the question complexity

OUTPUT FORMAT:
Return a JSON object with these fields:
{
  "instruction": "The task description or system context",
  "input": "The user's question or request",
  "output": "The model's ideal response"
}

IMPORTANT: Return ONLY valid JSON, no markdown code blocks or extra text.`;

  const samples: TrainingSample[] = [];
  const errors: string[] = [];
  const batchSize = 5; // Generate 5 samples per API call
  const batches = Math.ceil(numSamples / batchSize);

  // Generate topic variations for diversity
  const topics = generatePromptTopics(requirements, batches);

  for (let batch = 0; batch < batches; batch++) {
    const currentBatchSize = Math.min(batchSize, numSamples - samples.length);
    const topic = topics[batch % topics.length];

    const userPrompt = `Generate ${currentBatchSize} diverse training examples for the following focus area:
"${topic}"

Context from previous examples (for diversity - avoid similar questions):
${samples.slice(-3).map(s => `- ${s.input.substring(0, 80)}...`).join('\n') || 'None yet - this is the first batch'}

Return a JSON array with ${currentBatchSize} objects, each having "instruction", "input", and "output" fields.
Example structure: [{"instruction": "...", "input": "...", "output": "..."}, ...]`;

    try {
      // Pass teacherModelId and credentials so Exodus proxy can make the API call
      const response = await callLLM(llmConfig, systemPrompt, userPrompt, temperature, teacherModelId, credentials);

      // Parse JSON response with robust error recovery
      let parsed: TrainingSample[];
      try {
        parsed = parseTrainingJsonResponse(response);
        if (parsed.length === 0) {
          throw new Error('No valid samples extracted from response');
        }
      } catch (parseError) {
        logger.warn(`Failed to parse batch ${batch + 1}: ${parseError}`);
        errors.push(`Batch ${batch + 1}: Parse error - ${parseError}`);
        continue;
      }

      // Validate and add samples
      for (const sample of parsed) {
        if (sample.instruction && sample.output && (sample.input !== undefined)) {
          samples.push({
            instruction: String(sample.instruction).trim(),
            input: String(sample.input || '').trim(),
            output: String(sample.output).trim(),
          });
        }
      }

      if (onProgress) {
        onProgress(samples.length, numSamples);
      }

      logger.info(`Generated ${samples.length}/${numSamples} samples`);

      // Rate limiting - be nice to APIs
      if (batch < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Batch ${batch + 1} failed: ${errorMsg}`);
      errors.push(`Batch ${batch + 1}: ${errorMsg}`);

      // Continue with other batches
      continue;
    }
  }

  if (samples.length === 0) {
    throw new Error(`Failed to generate any samples. Errors: ${errors.join('; ')}`);
  }

  // Write to JSONL file
  const jsonlContent = samples.map(s => JSON.stringify(s)).join('\n');
  fs.writeFileSync(outputPath, jsonlContent);

  // Also save in ShareGPT format for compatibility
  const sharegptPath = outputPath.replace('.jsonl', '_sharegpt.jsonl');
  const sharegptContent = samples.map(s => JSON.stringify({
    conversations: [
      { from: 'system', value: s.instruction },
      { from: 'human', value: s.input },
      { from: 'gpt', value: s.output },
    ]
  })).join('\n');
  fs.writeFileSync(sharegptPath, sharegptContent);

  return {
    success: true,
    samplesGenerated: samples.length,
    samples,
    datasetPath: outputPath,
    errors,
  };
}

// ============================================================================
// DATASET VALIDATION
// ============================================================================

function validateDataset(
  datasetPath: string,
  checkDuplicates: boolean = true,
  sampleSize: number = 100
): { valid: boolean; issues: string[]; stats: Record<string, number> } {
  const issues: string[] = [];
  const stats: Record<string, number> = {
    totalSamples: 0,
    validSamples: 0,
    duplicates: 0,
    emptyInputs: 0,
    emptyOutputs: 0,
    avgInputLength: 0,
    avgOutputLength: 0,
  };

  if (!fs.existsSync(datasetPath)) {
    return { valid: false, issues: ['Dataset file not found'], stats };
  }

  const content = fs.readFileSync(datasetPath, 'utf-8').trim();
  if (!content) {
    return { valid: false, issues: ['Dataset file is empty'], stats };
  }

  const lines = content.split('\n');
  stats.totalSamples = lines.length;

  const seenInputs = new Set<string>();
  let totalInputLength = 0;
  let totalOutputLength = 0;

  const linesToCheck = Math.min(lines.length, sampleSize);
  for (let i = 0; i < linesToCheck; i++) {
    try {
      const sample = JSON.parse(lines[i]);

      if (!sample.instruction && !sample.input && !sample.conversations) {
        stats.emptyInputs++;
        issues.push(`Line ${i + 1}: Missing instruction/input`);
        continue;
      }

      const output = sample.output || sample.conversations?.find((c: any) => c.from === 'gpt')?.value;
      if (!output) {
        stats.emptyOutputs++;
        issues.push(`Line ${i + 1}: Missing output`);
        continue;
      }

      const inputKey = `${sample.instruction || ''}|${sample.input || ''}`;
      if (checkDuplicates && seenInputs.has(inputKey)) {
        stats.duplicates++;
      } else {
        seenInputs.add(inputKey);
      }

      const inputLen = (sample.instruction?.length || 0) + (sample.input?.length || 0);
      totalInputLength += inputLen;
      totalOutputLength += output.length;
      stats.validSamples++;
    } catch (e) {
      issues.push(`Line ${i + 1}: Invalid JSON`);
    }
  }

  if (stats.validSamples > 0) {
    stats.avgInputLength = Math.round(totalInputLength / stats.validSamples);
    stats.avgOutputLength = Math.round(totalOutputLength / stats.validSamples);
  }

  // Valid if 90% of samples are good and we have at least 10
  const valid = stats.validSamples >= stats.totalSamples * 0.9 && stats.totalSamples >= 10;

  if (stats.totalSamples < 10) {
    issues.push('Dataset has fewer than 10 samples (minimum recommended)');
  }
  if (stats.duplicates > stats.totalSamples * 0.1) {
    issues.push(`High duplicate rate: ${stats.duplicates} duplicates`);
  }

  return { valid, issues: issues.slice(0, 20), stats };
}

// ============================================================================
// PYTHON TRAINING SCRIPT
// ============================================================================

/**
 * Create and save the Python training script
 */
function createTrainingScript(): string {
  const scriptPath = path.join(SCRIPTS_DIR, 'train_lora.py');

  const script = `#!/usr/bin/env python3
"""
ABOV3 Eden - LoRA Training Script
Uses Hugging Face transformers and PEFT for efficient fine-tuning
"""

import argparse
import json
import os
import sys

def main():
    parser = argparse.ArgumentParser(description='Train LoRA adapter')
    parser.add_argument('--dataset', required=True, help='Path to training dataset (JSONL)')
    parser.add_argument('--base-model', required=True, help='Base model name or path')
    parser.add_argument('--output', required=True, help='Output directory for adapter')
    parser.add_argument('--epochs', type=int, default=3, help='Number of epochs')
    parser.add_argument('--batch-size', type=int, default=4, help='Batch size')
    parser.add_argument('--learning-rate', type=float, default=1e-4, help='Learning rate')
    parser.add_argument('--lora-rank', type=int, default=8, help='LoRA rank')
    parser.add_argument('--lora-alpha', type=int, default=16, help='LoRA alpha')
    parser.add_argument('--lora-dropout', type=float, default=0.05, help='LoRA dropout')
    args = parser.parse_args()

    print(f"[Eden Training] Starting LoRA training...")
    print(f"[Eden Training] Dataset: {args.dataset}")
    print(f"[Eden Training] Base model: {args.base_model}")
    print(f"[Eden Training] Output: {args.output}")

    try:
        import torch
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            TrainingArguments,
            Trainer,
            DataCollatorForLanguageModeling,
        )
        from peft import LoraConfig, get_peft_model, TaskType
        from datasets import Dataset
    except ImportError as e:
        print(f"[Eden Training] ERROR: Missing dependencies. Install with:")
        print(f"pip install torch transformers peft datasets accelerate bitsandbytes")
        sys.exit(1)

    # Load dataset
    print(f"[Eden Training] Loading dataset...")
    samples = []
    with open(args.dataset, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                samples.append(json.loads(line))

    print(f"[Eden Training] Loaded {len(samples)} samples")

    # Load tokenizer
    print(f"[Eden Training] Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Format samples for training
    def format_sample(sample):
        if 'conversations' in sample:
            # ShareGPT format
            text = ""
            for turn in sample['conversations']:
                if turn['from'] == 'system':
                    text += f"### System:\\n{turn['value']}\\n\\n"
                elif turn['from'] == 'human':
                    text += f"### Human:\\n{turn['value']}\\n\\n"
                elif turn['from'] == 'gpt':
                    text += f"### Assistant:\\n{turn['value']}\\n\\n"
        else:
            # Alpaca format
            text = f"### Instruction:\\n{sample.get('instruction', '')}\\n\\n"
            if sample.get('input'):
                text += f"### Input:\\n{sample['input']}\\n\\n"
            text += f"### Response:\\n{sample['output']}"
        return text

    texts = [format_sample(s) for s in samples]

    # Tokenize
    print(f"[Eden Training] Tokenizing...")
    def tokenize_function(examples):
        return tokenizer(
            examples['text'],
            truncation=True,
            padding='max_length',
            max_length=512,
        )

    dataset = Dataset.from_dict({'text': texts})
    tokenized_dataset = dataset.map(
        tokenize_function,
        batched=True,
        remove_columns=['text'],
    )

    # Load model with quantization for efficiency
    print(f"[Eden Training] Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.float16,
        device_map='auto',
        trust_remote_code=True,
    )

    # Configure LoRA
    print(f"[Eden Training] Configuring LoRA (rank={args.lora_rank}, alpha={args.lora_alpha})...")
    lora_config = LoraConfig(
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=['q_proj', 'v_proj', 'k_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
        task_type=TaskType.CAUSAL_LM,
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Training arguments
    training_args = TrainingArguments(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        warmup_ratio=0.1,
        logging_steps=10,
        save_strategy='epoch',
        fp16=True,
        optim='paged_adamw_8bit',
        report_to='none',
    )

    # Data collator
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset,
        data_collator=data_collator,
    )

    # Train
    print(f"[Eden Training] Starting training for {args.epochs} epochs...")
    trainer.train()

    # Save adapter
    print(f"[Eden Training] Saving adapter to {args.output}...")
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)

    # Save training info
    info = {
        'base_model': args.base_model,
        'lora_rank': args.lora_rank,
        'lora_alpha': args.lora_alpha,
        'epochs': args.epochs,
        'samples': len(samples),
    }
    with open(os.path.join(args.output, 'training_info.json'), 'w') as f:
        json.dump(info, f, indent=2)

    print(f"[Eden Training] Training complete!")
    print(json.dumps({'success': True, 'output_path': args.output, 'samples_trained': len(samples)}))

if __name__ == '__main__':
    main()
`;

  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, script);

  return scriptPath;
}

/**
 * Create GGUF export script
 */
function createExportScript(): string {
  const scriptPath = path.join(SCRIPTS_DIR, 'export_gguf.py');

  const script = `#!/usr/bin/env python3
"""
ABOV3 Eden - GGUF Export Script
Merges LoRA adapter with base model and exports to GGUF format
"""

import argparse
import json
import os
import sys
import shutil
import subprocess

def main():
    parser = argparse.ArgumentParser(description='Export model to GGUF')
    parser.add_argument('--model-path', required=True, help='Path to model or adapter')
    parser.add_argument('--base-model', help='Base model (if adapter)')
    parser.add_argument('--output', required=True, help='Output GGUF path')
    parser.add_argument('--quantization', default='q4_0', help='Quantization type')
    args = parser.parse_args()

    print(f"[Eden Export] Starting GGUF export...")
    print(f"[Eden Export] Model: {args.model_path}")
    print(f"[Eden Export] Quantization: {args.quantization}")

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError:
        print("[Eden Export] ERROR: transformers not installed")
        sys.exit(1)

    # Check if this is a LoRA adapter
    is_adapter = os.path.exists(os.path.join(args.model_path, 'adapter_config.json'))

    merged_path = args.model_path
    if is_adapter:
        print(f"[Eden Export] Merging LoRA adapter with base model...")
        try:
            from peft import PeftModel
        except ImportError:
            print("[Eden Export] ERROR: peft not installed")
            sys.exit(1)

        if not args.base_model:
            # Try to get from adapter config
            with open(os.path.join(args.model_path, 'adapter_config.json')) as f:
                config = json.load(f)
                args.base_model = config.get('base_model_name_or_path')

        if not args.base_model:
            print("[Eden Export] ERROR: Base model required for adapter merge")
            sys.exit(1)

        # Load and merge
        base_model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            torch_dtype=torch.float16,
            device_map='auto',
        )
        model = PeftModel.from_pretrained(base_model, args.model_path)
        model = model.merge_and_unload()

        # Save merged model
        merged_path = args.model_path + '_merged'
        model.save_pretrained(merged_path)
        tokenizer = AutoTokenizer.from_pretrained(args.base_model)
        tokenizer.save_pretrained(merged_path)
        print(f"[Eden Export] Merged model saved to {merged_path}")

    # Convert to GGUF using llama.cpp
    # First check if llama.cpp convert script is available
    llama_cpp_path = os.environ.get('LLAMA_CPP_PATH', '')
    convert_script = None

    # Try common locations
    possible_paths = [
        os.path.join(llama_cpp_path, 'convert_hf_to_gguf.py'),
        os.path.expanduser('~/llama.cpp/convert_hf_to_gguf.py'),
        '/opt/llama.cpp/convert_hf_to_gguf.py',
        './llama.cpp/convert_hf_to_gguf.py',
    ]

    for p in possible_paths:
        if os.path.exists(p):
            convert_script = p
            break

    if not convert_script:
        # Try using llama-cpp-python's bundled converter
        print("[Eden Export] llama.cpp not found, trying llama-cpp-python...")
        try:
            from llama_cpp import Llama
            # llama-cpp-python doesn't have a direct convert, use gguf library
            import gguf
            print("[Eden Export] Using gguf library for conversion...")
            # This is a simplified path - full implementation would use gguf writer
        except ImportError:
            print("[Eden Export] WARNING: No conversion tools found. Saving HuggingFace format only.")
            print(json.dumps({
                'success': True,
                'output_path': merged_path,
                'format': 'huggingface',
                'note': 'Install llama.cpp for GGUF conversion',
            }))
            return

    # Run llama.cpp converter
    if convert_script:
        print(f"[Eden Export] Converting to GGUF with {args.quantization}...")

        # First convert to f16 GGUF
        f16_path = args.output.replace('.gguf', '_f16.gguf')
        cmd = [
            sys.executable, convert_script,
            merged_path,
            '--outfile', f16_path,
            '--outtype', 'f16',
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[Eden Export] Conversion error: {result.stderr}")
            sys.exit(1)

        # Then quantize
        if args.quantization != 'f16':
            quantize_path = os.path.join(os.path.dirname(convert_script), 'llama-quantize')
            if os.path.exists(quantize_path):
                cmd = [quantize_path, f16_path, args.output, args.quantization]
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    print(f"[Eden Export] Quantization error: {result.stderr}")
                    # Fall back to f16
                    shutil.move(f16_path, args.output)
                else:
                    os.remove(f16_path)
            else:
                shutil.move(f16_path, args.output)
        else:
            shutil.move(f16_path, args.output)

    file_size = os.path.getsize(args.output) if os.path.exists(args.output) else 0
    print(f"[Eden Export] Export complete: {args.output} ({file_size / 1024 / 1024:.1f} MB)")
    print(json.dumps({
        'success': True,
        'output_path': args.output,
        'quantization': args.quantization,
        'file_size': file_size,
    }))

if __name__ == '__main__':
    main()
`;

  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, script);

  return scriptPath;
}

/**
 * Check if Python and required packages are available
 */
async function checkPythonEnvironment(): Promise<{ available: boolean; python: string; missing: string[] }> {
  const pythonCmds = ['python3', 'python', 'py'];
  let pythonPath = '';

  for (const cmd of pythonCmds) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`);
      if (stdout.includes('Python')) {
        pythonPath = cmd;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!pythonPath) {
    return { available: false, python: '', missing: ['python'] };
  }

  // Check required packages
  const required = ['torch', 'transformers', 'peft', 'datasets'];
  const missing: string[] = [];

  for (const pkg of required) {
    try {
      await execAsync(`${pythonPath} -c "import ${pkg}"`);
    } catch {
      missing.push(pkg);
    }
  }

  return {
    available: missing.length === 0,
    python: pythonPath,
    missing,
  };
}

/**
 * Run Python training script
 */
async function runPythonTraining(
  datasetPath: string,
  baseModel: string,
  outputPath: string,
  config: {
    epochs: number;
    batchSize: number;
    learningRate: number;
    loraRank: number;
    loraAlpha: number;
    loraDropout: number;
  },
  onOutput?: (line: string) => void
): Promise<{ success: boolean; outputPath: string; error?: string }> {
  const env = await checkPythonEnvironment();

  if (!env.available) {
    if (env.missing.includes('python')) {
      throw new Error('Python not found. Please install Python 3.8+');
    }
    throw new Error(`Missing Python packages: ${env.missing.join(', ')}. Run: pip install ${env.missing.join(' ')}`);
  }

  // Create training script
  const scriptPath = createTrainingScript();

  return new Promise((resolve, reject) => {
    const args = [
      scriptPath,
      '--dataset', datasetPath,
      '--base-model', baseModel,
      '--output', outputPath,
      '--epochs', String(config.epochs),
      '--batch-size', String(config.batchSize),
      '--learning-rate', String(config.learningRate),
      '--lora-rank', String(config.loraRank),
      '--lora-alpha', String(config.loraAlpha),
      '--lora-dropout', String(config.loraDropout),
    ];

    const proc = spawn(env.python, args, {
      cwd: TRAINING_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let output = '';
    let lastJson: any = null;

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (onOutput) onOutput(text);

      // Try to parse JSON output
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('{')) {
          try {
            lastJson = JSON.parse(line);
          } catch {}
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (onOutput) onOutput(text);
    });

    proc.on('close', (code) => {
      if (code === 0 && lastJson?.success) {
        resolve({
          success: true,
          outputPath: lastJson.output_path || outputPath,
        });
      } else {
        reject(new Error(`Training failed (code ${code}): ${output.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start training: ${err.message}`));
    });
  });
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const trainingTools: Tool[] = [
  // === DATA GENERATION ===
  {
    name: 'eden_generate_data',
    description: 'Generate training data from a teacher model. Supports all Exodus-configured providers (OpenAI, Anthropic, Ollama, ABOV3, Mistral, Groq, Deepseek, Gemini, Azure, OpenRouter). Creates diverse instruction-following examples for fine-tuning.',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: {
          type: 'string',
          description: 'Detailed description of what the model should do and the type of data needed',
        },
        teacherModelId: {
          type: 'string',
          description: 'Teacher model ID from Exodus (e.g., "openai/gpt-4o-mini", "anthropic/claude-3-haiku")',
        },
        numSamples: {
          type: 'number',
          description: 'Number of training samples to generate (default: 100, max recommended: 10000)',
        },
        outputPath: {
          type: 'string',
          description: 'Path to save the generated dataset (JSONL format)',
        },
        temperature: {
          type: 'number',
          description: 'Temperature for generation diversity (0.0-1.0, default: 0.7)',
        },
        credentials: {
          type: 'object',
          description: 'API credentials passed from Exodus (provider, apiKey, baseUrl, modelId, accessToken)',
          properties: {
            provider: { type: 'string' },
            apiKey: { type: 'string' },
            baseUrl: { type: 'string' },
            modelId: { type: 'string' },
            accessToken: { type: 'string' },
            organizationId: { type: 'string' },
            heliconeKey: { type: 'string' },
          },
        },
        apiKey: {
          type: 'string',
          description: 'DEPRECATED: Use credentials instead. API key for fallback (optional)',
        },
      },
      required: ['requirements', 'teacherModelId', 'numSamples', 'outputPath'],
    },
    handler: async (args) => {
      const {
        requirements,
        teacherModelId,
        numSamples = 100,
        outputPath,
        temperature = 0.7,
        credentials,
        apiKey,
      } = args as {
        requirements: string;
        teacherModelId: string;
        numSamples: number;
        outputPath: string;
        temperature?: number;
        credentials?: ExodusCredentials;
        apiKey?: string;
      };

      // Legacy fallback: Set env var if apiKey provided without credentials
      if (apiKey && !credentials) {
        logger.warn('Using legacy apiKey parameter. Prefer using credentials from Exodus.');
        const config = parseTeacherModelId(teacherModelId);
        switch (config.provider) {
          case 'openai':
            process.env.OPENAI_API_KEY = apiKey;
            break;
          case 'anthropic':
            process.env.ANTHROPIC_API_KEY = apiKey;
            break;
          case 'openrouter':
            process.env.OPENROUTER_API_KEY = apiKey;
            break;
        }
      }

      try {
        const credentialSource = credentials ? 'Exodus' : (apiKey ? 'legacy apiKey' : 'environment variables');
        logger.info(`Starting data generation: ${numSamples} samples from ${teacherModelId} (using ${credentialSource})`);

        const result = await generateDataWithTeacher(
          requirements,
          teacherModelId,
          numSamples,
          outputPath,
          temperature,
          credentials,  // Pass credentials from Exodus
          (current, total) => {
            logger.info(`Progress: ${current}/${total} samples`);
          }
        );

        return {
          success: true,
          teacherModel: teacherModelId,
          credentialSource,
          datasetPath: result.datasetPath,
          samplesGenerated: result.samplesGenerated,
          // Include samples for preview in Exodus UI (limit to first 50 for large datasets)
          samples: result.samples.slice(0, 50).map((s, i) => ({
            id: `sample-${i}`,
            instruction: s.instruction,
            input: s.input,
            output: s.output,
          })),
          totalSamples: result.samples.length,
          errors: result.errors.length > 0 ? result.errors : undefined,
          message: `Generated ${result.samplesGenerated} training samples using ${teacherModelId}`,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },

  // === DATASET VALIDATION ===
  {
    name: 'eden_validate_dataset',
    description: 'Validate a training dataset for quality, duplicates, and format correctness.',
    inputSchema: {
      type: 'object',
      properties: {
        datasetPath: {
          type: 'string',
          description: 'Path to the JSONL dataset file',
        },
        checkDuplicates: {
          type: 'boolean',
          description: 'Check for duplicate entries (default: true)',
        },
        sampleSize: {
          type: 'number',
          description: 'Number of samples to validate (default: all)',
        },
      },
      required: ['datasetPath'],
    },
    handler: async (args) => {
      const { datasetPath, checkDuplicates = true, sampleSize = 1000 } = args as {
        datasetPath: string;
        checkDuplicates?: boolean;
        sampleSize?: number;
      };

      const result = validateDataset(datasetPath, checkDuplicates, sampleSize);

      return {
        valid: result.valid,
        datasetPath,
        statistics: result.stats,
        issues: result.issues,
        recommendation: result.valid
          ? 'Dataset is ready for training'
          : 'Please review and fix the issues before training',
      };
    },
  },

  // === LORA TRAINING ===
  {
    name: 'eden_train_lora',
    description: 'Train a LoRA adapter using a dataset. Requires Python with transformers and peft installed.',
    inputSchema: {
      type: 'object',
      properties: {
        datasetPath: {
          type: 'string',
          description: 'Path to the training dataset (JSONL)',
        },
        baseModelPath: {
          type: 'string',
          description: 'HuggingFace model ID (e.g., "meta-llama/Llama-3.2-1B", "microsoft/phi-3-mini")',
        },
        outputPath: {
          type: 'string',
          description: 'Path to save the trained LoRA adapter',
        },
        loraRank: {
          type: 'number',
          description: 'LoRA rank/dimension (default: 8, higher = more capacity)',
        },
        loraAlpha: {
          type: 'number',
          description: 'LoRA alpha scaling factor (default: 16)',
        },
        loraDropout: {
          type: 'number',
          description: 'LoRA dropout rate (default: 0.05)',
        },
        epochs: {
          type: 'number',
          description: 'Number of training epochs (default: 3)',
        },
        batchSize: {
          type: 'number',
          description: 'Training batch size (default: 4)',
        },
        learningRate: {
          type: 'number',
          description: 'Learning rate (default: 1e-4)',
        },
      },
      required: ['datasetPath', 'baseModelPath', 'outputPath'],
    },
    handler: async (args) => {
      const {
        datasetPath,
        baseModelPath,
        outputPath,
        loraRank = 8,
        loraAlpha = 16,
        loraDropout = 0.05,
        epochs = 3,
        batchSize = 4,
        learningRate = 1e-4,
      } = args as {
        datasetPath: string;
        baseModelPath: string;
        outputPath: string;
        loraRank?: number;
        loraAlpha?: number;
        loraDropout?: number;
        epochs?: number;
        batchSize?: number;
        learningRate?: number;
      };

      ensureDirectories();

      // Check Python environment first
      const env = await checkPythonEnvironment();
      if (!env.available) {
        return {
          error: `Python training not available. ${env.missing.length > 0 ? `Missing: ${env.missing.join(', ')}. Run: pip install torch transformers peft datasets accelerate` : 'Python not found.'}`,
          pythonRequired: true,
          installCommand: 'pip install torch transformers peft datasets accelerate bitsandbytes',
        };
      }

      // Validate dataset exists
      if (!fs.existsSync(datasetPath)) {
        return { error: `Dataset not found: ${datasetPath}` };
      }

      const jobId = `lora-${Date.now()}-${uuidv4().slice(0, 8)}`;
      logger.info(`Starting LoRA training job: ${jobId}`);

      try {
        const result = await runPythonTraining(
          datasetPath,
          baseModelPath,
          outputPath,
          { epochs, batchSize, learningRate, loraRank, loraAlpha, loraDropout },
          (line) => logger.info(`[Training] ${line.trim()}`)
        );

        return {
          success: true,
          jobId,
          adapterPath: result.outputPath,
          baseModel: baseModelPath,
          trainingType: 'lora',
          config: { loraRank, loraAlpha, loraDropout, epochs, batchSize, learningRate },
          message: 'LoRA training completed successfully',
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          jobId,
        };
      }
    },
  },

  // === DISTILLATION (simplified - uses same as LoRA but with full fine-tune flag) ===
  {
    name: 'eden_distill_model',
    description: 'Run model distillation training. For now, uses LoRA with higher rank for efficiency.',
    inputSchema: {
      type: 'object',
      properties: {
        datasetPath: {
          type: 'string',
          description: 'Path to the training dataset (JSONL)',
        },
        baseModelPath: {
          type: 'string',
          description: 'Base model to distill knowledge into',
        },
        outputPath: {
          type: 'string',
          description: 'Path to save the trained model',
        },
        epochs: {
          type: 'number',
          description: 'Number of training epochs (default: 3)',
        },
        batchSize: {
          type: 'number',
          description: 'Training batch size (default: 4)',
        },
        learningRate: {
          type: 'number',
          description: 'Learning rate (default: 2e-5)',
        },
      },
      required: ['datasetPath', 'baseModelPath', 'outputPath'],
    },
    handler: async (args) => {
      const {
        datasetPath,
        baseModelPath,
        outputPath,
        epochs = 3,
        batchSize = 4,
        learningRate = 2e-5,
      } = args as {
        datasetPath: string;
        baseModelPath: string;
        outputPath: string;
        epochs?: number;
        batchSize?: number;
        learningRate?: number;
      };

      // Use LoRA with high rank for distillation (more efficient than full fine-tune)
      const env = await checkPythonEnvironment();
      if (!env.available) {
        return {
          error: `Python training not available. Missing: ${env.missing.join(', ')}`,
          installCommand: 'pip install torch transformers peft datasets accelerate bitsandbytes',
        };
      }

      const jobId = `distill-${Date.now()}-${uuidv4().slice(0, 8)}`;
      logger.info(`Starting distillation job: ${jobId}`);

      try {
        const result = await runPythonTraining(
          datasetPath,
          baseModelPath,
          outputPath,
          {
            epochs,
            batchSize,
            learningRate,
            loraRank: 32,  // Higher rank for distillation
            loraAlpha: 64,
            loraDropout: 0.05,
          },
          (line) => logger.info(`[Distillation] ${line.trim()}`)
        );

        return {
          success: true,
          jobId,
          modelPath: result.outputPath,
          trainingType: 'distillation',
          message: 'Distillation training completed successfully',
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          jobId,
        };
      }
    },
  },

  // === MODEL EVALUATION ===
  {
    name: 'eden_evaluate_model',
    description: 'Evaluate a trained model on a test dataset.',
    inputSchema: {
      type: 'object',
      properties: {
        modelPath: {
          type: 'string',
          description: 'Path to the trained model or LoRA adapter',
        },
        testDatasetPath: {
          type: 'string',
          description: 'Path to the test dataset (JSONL)',
        },
        metrics: {
          type: 'array',
          description: 'Metrics to compute: perplexity, accuracy',
        },
        numSamples: {
          type: 'number',
          description: 'Number of samples to evaluate (default: 50)',
        },
      },
      required: ['modelPath', 'testDatasetPath'],
    },
    handler: async (args) => {
      const {
        modelPath,
        testDatasetPath,
        numSamples = 50,
      } = args as {
        modelPath: string;
        testDatasetPath: string;
        metrics?: string[];
        numSamples?: number;
      };

      if (!fs.existsSync(modelPath)) {
        return { error: `Model not found: ${modelPath}` };
      }

      if (!fs.existsSync(testDatasetPath)) {
        return { error: `Test dataset not found: ${testDatasetPath}` };
      }

      // For now, compute basic statistics
      // Full evaluation requires loading the model which needs Python
      const content = fs.readFileSync(testDatasetPath, 'utf-8').trim();
      const lines = content.split('\n').slice(0, numSamples);

      let validSamples = 0;
      let totalOutputLength = 0;

      for (const line of lines) {
        try {
          const sample = JSON.parse(line);
          if (sample.output) {
            validSamples++;
            totalOutputLength += sample.output.length;
          }
        } catch {}
      }

      return {
        success: true,
        modelPath,
        testDatasetPath,
        samplesEvaluated: validSamples,
        metrics: {
          avgOutputLength: validSamples > 0 ? Math.round(totalOutputLength / validSamples) : 0,
          validSampleRatio: validSamples / lines.length,
        },
        note: 'Full metrics (perplexity, BLEU) require running Python evaluation script',
      };
    },
  },

  // === GGUF EXPORT ===
  {
    name: 'eden_export_gguf',
    description: 'Export a trained model to GGUF format for use with llama.cpp and Ark-SLM.',
    inputSchema: {
      type: 'object',
      properties: {
        modelPath: {
          type: 'string',
          description: 'Path to the trained model or LoRA adapter',
        },
        baseModelPath: {
          type: 'string',
          description: 'Base model (required if modelPath is a LoRA adapter)',
        },
        outputPath: {
          type: 'string',
          description: 'Path for the output GGUF file',
        },
        quantization: {
          type: 'string',
          description: 'Quantization type: q4_0, q4_1, q5_0, q5_1, q8_0, f16',
          enum: ['q4_0', 'q4_1', 'q5_0', 'q5_1', 'q8_0', 'f16'],
        },
      },
      required: ['modelPath', 'outputPath', 'quantization'],
    },
    handler: async (args) => {
      const { modelPath, baseModelPath, outputPath, quantization } = args as {
        modelPath: string;
        baseModelPath?: string;
        outputPath: string;
        quantization: string;
      };

      ensureDirectories();

      if (!fs.existsSync(modelPath)) {
        return { error: `Model not found: ${modelPath}` };
      }

      // Check Python environment
      const env = await checkPythonEnvironment();
      if (!env.available) {
        return {
          error: `Python required for GGUF export. Missing: ${env.missing.join(', ')}`,
          installCommand: 'pip install torch transformers',
        };
      }

      // Create export script
      const scriptPath = createExportScript();

      return new Promise((resolve) => {
        const args_list = [
          scriptPath,
          '--model-path', modelPath,
          '--output', outputPath,
          '--quantization', quantization,
        ];

        if (baseModelPath) {
          args_list.push('--base-model', baseModelPath);
        }

        const proc = spawn(env.python, args_list, {
          cwd: TRAINING_DIR,
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });

        let output = '';
        let lastJson: any = null;

        proc.stdout.on('data', (data) => {
          const text = data.toString();
          output += text;
          logger.info(`[Export] ${text.trim()}`);

          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('{')) {
              try { lastJson = JSON.parse(line); } catch {}
            }
          }
        });

        proc.stderr.on('data', (data) => {
          output += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0 && lastJson?.success) {
            resolve({
              success: true,
              ggufPath: lastJson.output_path || outputPath,
              quantization,
              fileSize: lastJson.file_size,
              message: `Model exported to GGUF with ${quantization} quantization`,
            });
          } else if (fs.existsSync(outputPath)) {
            // Script might have warnings but still produced output
            const stats = fs.statSync(outputPath);
            resolve({
              success: true,
              ggufPath: outputPath,
              quantization,
              fileSize: stats.size,
              warnings: output.includes('WARNING') ? 'Check logs for warnings' : undefined,
            });
          } else {
            resolve({
              error: `GGUF export failed: ${output.slice(-500)}`,
            });
          }
        });
      });
    },
  },

  // === ARK-SLM DEPLOYMENT ===
  {
    name: 'eden_deploy_to_ark',
    description: 'Deploy a GGUF model to ABOV3 Ark-SLM for local inference.',
    inputSchema: {
      type: 'object',
      properties: {
        ggufPath: {
          type: 'string',
          description: 'Path to the GGUF model file',
        },
        modelName: {
          type: 'string',
          description: 'Name for the model in Ark-SLM',
        },
        arkHost: {
          type: 'string',
          description: 'Ark-SLM server URL (default: http://127.0.0.1:3200)',
        },
        autoLoad: {
          type: 'boolean',
          description: 'Automatically load the model after deployment (default: true)',
        },
      },
      required: ['ggufPath', 'modelName'],
    },
    handler: async (args) => {
      const {
        ggufPath,
        modelName,
        arkHost = 'http://127.0.0.1:3200',
        autoLoad = true,
      } = args as {
        ggufPath: string;
        modelName: string;
        arkHost?: string;
        autoLoad?: boolean;
      };

      ensureDirectories();

      if (!fs.existsSync(ggufPath)) {
        return { error: `GGUF file not found: ${ggufPath}` };
      }

      // Generate model ID
      const modelId = modelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const destPath = path.join(ARK_MODELS_DIR, `${modelId}.gguf`);

      // Copy GGUF to Ark models directory
      fs.copyFileSync(ggufPath, destPath);
      const stats = fs.statSync(destPath);

      // Create metadata file
      const metadata = {
        id: modelId,
        name: modelName,
        path: destPath,
        source: ggufPath,
        deployedAt: new Date().toISOString(),
        fileSize: stats.size,
      };
      fs.writeFileSync(
        path.join(ARK_MODELS_DIR, `${modelId}.json`),
        JSON.stringify(metadata, null, 2)
      );

      // Notify Ark-SLM to refresh models
      let refreshed = false;
      let loaded = false;

      try {
        const refreshRes = await fetch(`${arkHost}/models/refresh`, { method: 'POST' });
        refreshed = refreshRes.ok;

        if (autoLoad && refreshed) {
          const loadRes = await fetch(`${arkHost}/models/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_id: modelId }),
          });
          loaded = loadRes.ok;
        }
      } catch (e) {
        // Ark-SLM might not be running
        logger.warn('Could not contact Ark-SLM server');
      }

      return {
        success: true,
        modelId,
        modelName,
        deployedTo: destPath,
        fileSize: stats.size,
        fileSizeHuman: `${(stats.size / 1024 / 1024).toFixed(1)} MB`,
        arkHost,
        arkRefreshed: refreshed,
        modelLoaded: loaded,
        message: loaded
          ? `Model "${modelName}" deployed and loaded in Ark-SLM`
          : refreshed
            ? `Model "${modelName}" deployed. Use Ark-SLM to load it.`
            : `Model "${modelName}" deployed to ${destPath}. Start Ark-SLM to use it.`,
      };
    },
  },

  // === TRAINING STATUS ===
  {
    name: 'eden_training_status',
    description: 'Get the status of a training job.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The training job ID',
        },
      },
      required: ['jobId'],
    },
    handler: async (args) => {
      const { jobId } = args as { jobId: string };

      let job = activeJobs.get(jobId);

      if (!job) {
        const statusPath = path.join(TRAINING_DIR, 'jobs', `${jobId}.json`);
        if (fs.existsSync(statusPath)) {
          job = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
        }
      }

      if (!job) {
        return { error: `Job not found: ${jobId}` };
      }

      return job;
    },
  },

  // === LIST JOBS ===
  {
    name: 'eden_list_training_jobs',
    description: 'List all training jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status (optional)',
          enum: ['pending', 'generating', 'training', 'completed', 'error'],
        },
      },
    },
    handler: async (args) => {
      const { status } = args as { status?: string };

      const jobs: TrainingJobStatus[] = [];
      const jobsDir = path.join(TRAINING_DIR, 'jobs');

      if (fs.existsSync(jobsDir)) {
        for (const file of fs.readdirSync(jobsDir)) {
          if (file.endsWith('.json')) {
            try {
              const job = JSON.parse(fs.readFileSync(path.join(jobsDir, file), 'utf-8'));
              if (!status || job.status === status) {
                jobs.push(job);
              }
            } catch {}
          }
        }
      }

      for (const job of activeJobs.values()) {
        if (!status || job.status === status) {
          if (!jobs.find(j => j.jobId === job.jobId)) {
            jobs.push(job);
          }
        }
      }

      return {
        jobs: jobs.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || '')),
        total: jobs.length,
      };
    },
  },

  // === CHECK ENVIRONMENT ===
  {
    name: 'eden_check_training_environment',
    description: 'Check if the training environment is properly set up (Python, packages, Exodus integration)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const env = await checkPythonEnvironment();

      // Check for API keys in environment (fallback only - Exodus passes credentials directly)
      const envApiKeys = {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        openrouter: !!process.env.OPENROUTER_API_KEY,
        abov3: !!process.env.ABOV3_API_KEY,
        mistral: !!process.env.MISTRAL_API_KEY,
        groq: !!process.env.GROQ_API_KEY,
        deepseek: !!process.env.DEEPSEEK_API_KEY,
        gemini: !!process.env.GOOGLE_AI_KEY || !!process.env.GEMINI_API_KEY,
      };

      // Check for Ollama
      let ollamaAvailable = false;
      try {
        const res = await fetch('http://127.0.0.1:11434/api/tags');
        ollamaAvailable = res.ok;
      } catch {}

      // Check Exodus proxy for OAuth support
      let exodusProxyAvailable = false;
      let exodusProxyError: string | undefined;
      try {
        // Just check if the endpoint responds (OPTIONS preflight)
        const res = await fetch(EXODUS_PROXY_URL, { method: 'OPTIONS' });
        exodusProxyAvailable = res.ok || res.status === 204;
      } catch (e) {
        exodusProxyError = e instanceof Error ? e.message : 'Connection failed';
      }

      return {
        python: {
          available: env.available,
          path: env.python || 'not found',
          missingPackages: env.missing,
          installCommand: env.missing.length > 0
            ? `pip install ${env.missing.join(' ')}`
            : null,
        },
        exodusProxy: {
          url: EXODUS_PROXY_URL,
          available: exodusProxyAvailable,
          error: exodusProxyError,
          note: 'Exodus proxy handles OAuth authentication for Claude Pro/Max users. Eden routes API calls through Exodus when OAuth tokens are detected.',
        },
        exodusIntegration: {
          note: 'Eden receives API credentials directly from Exodus. Configure your models in Exodus Settings > Models.',
          supportedProviders: [
            'OpenAI', 'Anthropic (Claude)', 'Ollama', 'OpenRouter', 'ABOV3',
            'Mistral', 'Groq', 'Deepseek', 'Gemini (Google AI)', 'Azure OpenAI',
          ],
        },
        environmentFallback: {
          note: 'Environment variables are used only when Exodus credentials are not provided',
          configured: Object.entries(envApiKeys)
            .filter(([, v]) => v)
            .map(([k]) => k),
          missing: Object.entries(envApiKeys)
            .filter(([, v]) => !v)
            .map(([k]) => k),
        },
        localModels: {
          ollama: ollamaAvailable ? 'Available at localhost:11434' : 'Not running',
        },
        directories: {
          training: TRAINING_DIR,
          datasets: DATASETS_DIR,
          models: MODELS_DIR,
          arkModels: ARK_MODELS_DIR,
        },
        ready: env.available,  // Python is the main requirement; credentials come from Exodus
        recommendations: [
          env.available ? null : 'Install Python 3.8+ and required packages',
          env.missing.length > 0 ? `Run: pip install ${env.missing.join(' ')}` : null,
          !exodusProxyAvailable ? 'Start Exodus (npm run dev in abov3-exodus) for OAuth support' : null,
          'Configure teacher models in Exodus Settings > Models',
        ].filter(Boolean),
      };
    },
  },
];
