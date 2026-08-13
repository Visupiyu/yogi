import type { ToolDeclaration } from "@/lib/ai/client";

export type ToolContext = {
  uid: string;
  email: string | null;
  isAdmin: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: object;
  execute: (
    args: Record<string, unknown>,
    context: ToolContext
  ) => Promise<unknown>;
};

export function buildToolRegistry(
  tools: ToolDefinition[],
  context: ToolContext
): {
  declarations: ToolDeclaration[];
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
} {
  const declarations = tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));

  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  const executeTool = async (
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> => {
    const tool = byName.get(name);
    if (!tool) {
      return { error: `Unknown tool: ${name}` };
    }
    return tool.execute(args, context);
  };

  return { declarations, executeTool };
}
