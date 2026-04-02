/**
 * SLM Tools - Dataset creation, training, and deployment tools for Small Language Models
 *
 * These tools enable knowledge distillation from large LLMs (Claude, OpenAI, etc.)
 * to create task-specific small language models that run locally via ABOV3 Ark-SLM.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import type { Tool } from './index.js';

// Base directory for SLM data
const SLM_BASE_DIR = path.join(os.homedir(), '.abov3', 'slm');
const DATASETS_DIR = path.join(SLM_BASE_DIR, 'datasets');
const MODELS_DIR = path.join(SLM_BASE_DIR, 'models');
const ARK_MODELS_DIR = path.join(os.homedir(), '.abov3', 'ark-slm', 'models');

// Ensure directories exist
function ensureDirectories() {
  for (const dir of [SLM_BASE_DIR, DATASETS_DIR, MODELS_DIR, ARK_MODELS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Dataset configuration interface
interface DatasetConfig {
  id: string;
  name: string;
  task_type: 'classification' | 'extraction' | 'generation' | 'qa' | 'custom';
  description: string;
  output_format: string;
  created_at: string;
  updated_at: string;
  seed_count: number;
  generated_count: number;
  status: 'created' | 'generating' | 'ready' | 'training';
}

// Training example interface
interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
}

// Model config interface
interface ModelConfig {
  id: string;
  name: string;
  dataset_id: string;
  base_model: string;
  status: 'pending' | 'training' | 'completed' | 'failed' | 'deployed';
  created_at: string;
  training_started_at?: string;
  training_completed_at?: string;
  metrics?: {
    accuracy?: number;
    loss?: number;
    epochs_completed?: number;
  };
  gguf_path?: string;
}

// Export all SLM tools
export const slmTools: Tool[] = [
  // === DATASET MANAGEMENT ===
  {
    name: 'slm_create_dataset',
    description: 'Create a new dataset for training a Small Language Model. Returns a dataset ID for use with other SLM tools.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the dataset (e.g., "sentiment-classifier", "ticket-categorizer")',
        },
        task_type: {
          type: 'string',
          description: 'Type of task: classification, extraction, generation, qa, or custom',
          enum: ['classification', 'extraction', 'generation', 'qa', 'custom'],
        },
        description: {
          type: 'string',
          description: 'Detailed description of what the model should do',
        },
        output_format: {
          type: 'string',
          description: 'Expected output format (e.g., "JSON object with sentiment field", "free text summary")',
        },
      },
      required: ['name', 'task_type', 'description'],
    },
    handler: async (args) => {
      ensureDirectories();

      const { name, task_type, description, output_format } = args as {
        name: string;
        task_type: string;
        description: string;
        output_format?: string;
      };

      // Generate dataset ID
      const id = `dataset-${Date.now()}-${uuidv4().slice(0, 8)}`;
      const datasetDir = path.join(DATASETS_DIR, id);

      // Create dataset directory
      fs.mkdirSync(datasetDir, { recursive: true });

      // Create config
      const config: DatasetConfig = {
        id,
        name,
        task_type: task_type as DatasetConfig['task_type'],
        description,
        output_format: output_format || 'free text',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        seed_count: 0,
        generated_count: 0,
        status: 'created',
      };

      // Save config
      fs.writeFileSync(path.join(datasetDir, 'config.json'), JSON.stringify(config, null, 2));

      // Create empty JSONL files
      fs.writeFileSync(path.join(datasetDir, 'seed_examples.jsonl'), '');
      fs.writeFileSync(path.join(datasetDir, 'generated.jsonl'), '');

      return {
        success: true,
        dataset_id: id,
        name,
        task_type,
        description,
        path: datasetDir,
        next_step: `Add seed examples using slm_add_examples with dataset_id="${id}"`,
      };
    },
  },

  {
    name: 'slm_add_examples',
    description: 'Add training examples to a dataset. Provide examples in the Alpaca format (instruction, input, output).',
    inputSchema: {
      type: 'object',
      properties: {
        dataset_id: {
          type: 'string',
          description: 'The dataset ID returned from slm_create_dataset',
        },
        examples: {
          type: 'array',
          description: 'Array of training examples, each with instruction, input, and output fields',
        },
      },
      required: ['dataset_id', 'examples'],
    },
    handler: async (args) => {
      const { dataset_id, examples } = args as {
        dataset_id: string;
        examples: TrainingExample[];
      };

      const datasetDir = path.join(DATASETS_DIR, dataset_id);
      const configPath = path.join(datasetDir, 'config.json');

      if (!fs.existsSync(configPath)) {
        return { error: `Dataset not found: ${dataset_id}` };
      }

      // Validate examples
      if (!Array.isArray(examples) || examples.length === 0) {
        return { error: 'examples must be a non-empty array' };
      }

      for (let i = 0; i < examples.length; i++) {
        const ex = examples[i];
        if (!ex.instruction || !ex.input || !ex.output) {
          return { error: `Example ${i + 1} is missing required fields (instruction, input, output)` };
        }
      }

      // Append to seed examples
      const seedPath = path.join(datasetDir, 'seed_examples.jsonl');
      const lines = examples.map(ex => JSON.stringify(ex)).join('\n') + '\n';
      fs.appendFileSync(seedPath, lines);

      // Update config
      const config: DatasetConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.seed_count += examples.length;
      config.updated_at = new Date().toISOString();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      return {
        success: true,
        dataset_id,
        examples_added: examples.length,
        total_seed_examples: config.seed_count,
        next_step: config.seed_count >= 10
          ? `Ready to generate training data using slm_generate_training_data`
          : `Add more seed examples (recommend at least 10-20 for good results)`,
      };
    },
  },

  {
    name: 'slm_list_datasets',
    description: 'List all SLM training datasets',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      ensureDirectories();

      if (!fs.existsSync(DATASETS_DIR)) {
        return { datasets: [], total: 0 };
      }

      const datasets: DatasetConfig[] = [];
      const dirs = fs.readdirSync(DATASETS_DIR);

      for (const dir of dirs) {
        const configPath = path.join(DATASETS_DIR, dir, 'config.json');
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            datasets.push(config);
          } catch {
            // Skip invalid configs
          }
        }
      }

      return {
        datasets: datasets.map(d => ({
          id: d.id,
          name: d.name,
          task_type: d.task_type,
          status: d.status,
          seed_count: d.seed_count,
          generated_count: d.generated_count,
          created_at: d.created_at,
        })),
        total: datasets.length,
      };
    },
  },

  {
    name: 'slm_get_dataset',
    description: 'Get detailed information about a dataset including sample examples',
    inputSchema: {
      type: 'object',
      properties: {
        dataset_id: {
          type: 'string',
          description: 'The dataset ID',
        },
        include_examples: {
          type: 'boolean',
          description: 'Whether to include sample examples (default: true)',
        },
      },
      required: ['dataset_id'],
    },
    handler: async (args) => {
      const { dataset_id, include_examples = true } = args as {
        dataset_id: string;
        include_examples?: boolean;
      };

      const datasetDir = path.join(DATASETS_DIR, dataset_id);
      const configPath = path.join(datasetDir, 'config.json');

      if (!fs.existsSync(configPath)) {
        return { error: `Dataset not found: ${dataset_id}` };
      }

      const config: DatasetConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      const result: Record<string, unknown> = { ...config, path: datasetDir };

      if (include_examples) {
        // Read first 5 seed examples
        const seedPath = path.join(datasetDir, 'seed_examples.jsonl');
        if (fs.existsSync(seedPath)) {
          const content = fs.readFileSync(seedPath, 'utf-8').trim();
          if (content) {
            const lines = content.split('\n').slice(0, 5);
            result.sample_seed_examples = lines.map(l => JSON.parse(l));
          }
        }

        // Read first 5 generated examples
        const genPath = path.join(datasetDir, 'generated.jsonl');
        if (fs.existsSync(genPath)) {
          const content = fs.readFileSync(genPath, 'utf-8').trim();
          if (content) {
            const lines = content.split('\n').slice(0, 5);
            result.sample_generated_examples = lines.map(l => JSON.parse(l));
          }
        }
      }

      return result;
    },
  },

  {
    name: 'slm_delete_dataset',
    description: 'Delete a dataset and all its examples',
    inputSchema: {
      type: 'object',
      properties: {
        dataset_id: {
          type: 'string',
          description: 'The dataset ID to delete',
        },
      },
      required: ['dataset_id'],
    },
    handler: async (args) => {
      const { dataset_id } = args as { dataset_id: string };

      const datasetDir = path.join(DATASETS_DIR, dataset_id);

      if (!fs.existsSync(datasetDir)) {
        return { error: `Dataset not found: ${dataset_id}` };
      }

      // Remove directory recursively
      fs.rmSync(datasetDir, { recursive: true, force: true });

      return {
        success: true,
        deleted: dataset_id,
      };
    },
  },

  // === MODEL MANAGEMENT ===
  {
    name: 'slm_list_models',
    description: 'List all trained SLM models',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      ensureDirectories();

      const models: ModelConfig[] = [];

      // Check models directory
      if (fs.existsSync(MODELS_DIR)) {
        const dirs = fs.readdirSync(MODELS_DIR);
        for (const dir of dirs) {
          const configPath = path.join(MODELS_DIR, dir, 'config.json');
          if (fs.existsSync(configPath)) {
            try {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
              models.push(config);
            } catch {
              // Skip invalid configs
            }
          }
        }
      }

      return {
        models: models.map(m => ({
          id: m.id,
          name: m.name,
          dataset_id: m.dataset_id,
          base_model: m.base_model,
          status: m.status,
          created_at: m.created_at,
          metrics: m.metrics,
        })),
        total: models.length,
      };
    },
  },

  {
    name: 'slm_deploy',
    description: 'Deploy a trained GGUF model to ABOV3 Ark-SLM for inference',
    inputSchema: {
      type: 'object',
      properties: {
        model_path: {
          type: 'string',
          description: 'Path to the GGUF model file',
        },
        name: {
          type: 'string',
          description: 'Display name for the model in Ark-SLM',
        },
        context_length: {
          type: 'number',
          description: 'Context length for the model (default: 4096)',
        },
        chat_template: {
          type: 'string',
          description: 'Chat template to use: llama3, qwen, phi, chatml, default',
          enum: ['llama3', 'qwen', 'phi', 'chatml', 'default'],
        },
      },
      required: ['model_path', 'name'],
    },
    handler: async (args) => {
      const { model_path, name, context_length = 4096, chat_template = 'default' } = args as {
        model_path: string;
        name: string;
        context_length?: number;
        chat_template?: string;
      };

      if (!fs.existsSync(model_path)) {
        return { error: `Model file not found: ${model_path}` };
      }

      if (!model_path.endsWith('.gguf')) {
        return { error: 'Model must be a GGUF file' };
      }

      ensureDirectories();

      // Generate model ID
      const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const destPath = path.join(ARK_MODELS_DIR, `${id}.gguf`);

      // Copy model file
      fs.copyFileSync(model_path, destPath);

      // Create metadata file
      const metadata = {
        id,
        name,
        path: destPath,
        context_length,
        chat_template,
        deployed_at: new Date().toISOString(),
        source_path: model_path,
      };

      fs.writeFileSync(
        path.join(ARK_MODELS_DIR, `${id}.json`),
        JSON.stringify(metadata, null, 2)
      );

      // Try to notify Ark-SLM to refresh models
      try {
        await fetch('http://localhost:3200/models/refresh', { method: 'POST' });
      } catch {
        // Ark-SLM might not be running
      }

      return {
        success: true,
        model_id: id,
        name,
        deployed_to: destPath,
        ark_url: 'http://localhost:3200',
        next_step: `Load the model in Ark-SLM: POST http://localhost:3200/models/load with {"model_id": "${id}"}`,
      };
    },
  },

  // === ARK-SLM SERVER MANAGEMENT ===
  {
    name: 'slm_ark_status',
    description: 'Check the status of ABOV3 Ark-SLM inference server',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      try {
        const healthRes = await fetch('http://localhost:3200/health');
        const health = await healthRes.json() as Record<string, unknown>;

        const modelsRes = await fetch('http://localhost:3200/v1/models');
        const models = await modelsRes.json() as { data?: Array<{ id: string; name: string; loaded: boolean }> };

        const statusRes = await fetch('http://localhost:3200/models/status');
        const status = await statusRes.json() as { current_model: unknown };

        return {
          online: true,
          server: health.server,
          version: health.version,
          loaded_model: status.current_model,
          available_models: models.data?.length || 0,
          models: models.data?.map((m) => ({
            id: m.id,
            name: m.name,
            loaded: m.loaded,
          })),
        };
      } catch {
        return {
          online: false,
          error: 'Ark-SLM server is not running',
          hint: 'Start Ark-SLM with: cd abov3-ark-slm && npm run dev',
        };
      }
    },
  },

  {
    name: 'slm_ark_load',
    description: 'Load a model in ABOV3 Ark-SLM for inference',
    inputSchema: {
      type: 'object',
      properties: {
        model_id: {
          type: 'string',
          description: 'The model ID to load (from slm_ark_status)',
        },
      },
      required: ['model_id'],
    },
    handler: async (args) => {
      const { model_id } = args as { model_id: string };

      try {
        const response = await fetch('http://localhost:3200/models/load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_id }),
        });

        const result = await response.json() as { model?: unknown; error?: { message?: string } };

        if (!response.ok) {
          return { error: result.error?.message || 'Failed to load model' };
        }

        return {
          success: true,
          model: result.model,
          ready_for_inference: true,
          endpoint: 'POST http://localhost:3200/v1/chat/completions',
        };
      } catch {
        return {
          error: 'Failed to connect to Ark-SLM',
          hint: 'Make sure Ark-SLM is running on port 3200',
        };
      }
    },
  },

  {
    name: 'slm_ark_unload',
    description: 'Unload the currently loaded model from ABOV3 Ark-SLM',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      try {
        const response = await fetch('http://localhost:3200/models/unload', {
          method: 'POST',
        });

        const result = await response.json() as { success?: boolean; error?: { message?: string } };

        if (!response.ok) {
          return { error: result.error?.message || 'Failed to unload model' };
        }

        return {
          success: true,
          message: 'Model unloaded',
        };
      } catch {
        return {
          error: 'Failed to connect to Ark-SLM',
          hint: 'Make sure Ark-SLM is running on port 3200',
        };
      }
    },
  },
];
