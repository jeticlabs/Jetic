import { z } from 'zod';
import { loadModel, saveModel } from '../types';
import { Environment } from '@jetic/model';

export const manageEnvironmentSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  action: z.enum(['list', 'add', 'update', 'delete']).describe('Action to perform'),
  name: z.string().optional().describe('Environment name (e.g. local, staging, production)'),
  baseUrl: z.string().optional().describe('Base URL for target server (e.g. http://localhost:4000)'),
});

export function handleManageEnvironment(args: z.infer<typeof manageEnvironmentSchema>) {
  const { model, filePath } = loadModel(args.projectPath);
  model.environments = model.environments || [];

  if (args.action === 'list') {
    return {
      filePath,
      environments: model.environments,
    };
  }

  if (args.action === 'add' || args.action === 'update') {
    if (!args.name) {
      throw new Error('Environment "name" is required for add/update action.');
    }

    const existingIndex = model.environments.findIndex((e) => e.name === args.name);

    if (existingIndex >= 0) {
      if (args.baseUrl) model.environments[existingIndex].baseUrl = args.baseUrl;
    } else {
      if (!args.baseUrl) {
        throw new Error('Base URL is required when adding a new environment.');
      }
      model.environments.push({
        name: args.name,
        baseUrl: args.baseUrl,
      });
    }

    saveModel(filePath, model);

    return {
      success: true,
      action: existingIndex >= 0 ? 'updated' : 'added',
      filePath,
      environments: model.environments,
    };
  }

  if (args.action === 'delete') {
    if (!args.name) {
      throw new Error('Environment "name" is required for delete action.');
    }

    model.environments = model.environments.filter((e) => e.name !== args.name);
    saveModel(filePath, model);

    return {
      success: true,
      action: 'deleted',
      filePath,
      environments: model.environments,
    };
  }

  throw new Error(`Unsupported action: ${args.action}`);
}
