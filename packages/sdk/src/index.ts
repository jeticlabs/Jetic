import { z } from 'zod';

export interface ToolContext {
  projectRoot: string;
}

export interface JeticTool<Input extends z.ZodTypeAny = z.ZodTypeAny, Output extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  input: Input;
  output?: Output;
  execute(input: z.infer<Input>, ctx: ToolContext): Promise<unknown>;
}

export function defineTool<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny = z.ZodTypeAny>(
  tool: JeticTool<Input, Output>
): JeticTool<Input, Output> {
  return tool;
}

/** Shape expected from a project's `jetic.tools.ts` entry (project.md §23). */
export interface ToolsModule {
  tools: JeticTool[];
}
