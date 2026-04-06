import * as path from 'node:path';
import type { SourceType } from '../core/types';

export type MonitoredExecutionRequest =
  | {
      kind: 'shell';
      label: string;
      sourceType: SourceType;
      commandLine: string;
      cwd?: string;
      env?: Record<string, string | undefined>;
      metadata?: Record<string, string | undefined>;
    }
  | {
      kind: 'process';
      label: string;
      sourceType: SourceType;
      command: string;
      args: string[];
      cwd?: string;
      env?: Record<string, string | undefined>;
      metadata?: Record<string, string | undefined>;
    };

export interface TaskDefinitionRequestInput {
  taskName: string;
  definitionType: string;
  definition: Record<string, unknown>;
  scopePath?: string;
}

export function buildTaskDefinitionRequest(input: TaskDefinitionRequestInput): MonitoredExecutionRequest | undefined {
  switch (input.definitionType) {
    case 'npm':
      return buildNpmTaskRequest(input);
    default:
      return undefined;
  }
}

function buildNpmTaskRequest(input: TaskDefinitionRequestInput): MonitoredExecutionRequest | undefined {
  const script = readString(input.definition.script);
  if (!script) {
    return undefined;
  }

  const extraArgs = readStringArray(input.definition.args);
  const taskPath = readString(input.definition.path);
  const commandLineParts = ['npm', 'run', script];
  if (extraArgs.length > 0) {
    commandLineParts.push('--', ...extraArgs);
  }

  const commandLine = commandLineParts.map(quoteShellToken).join(' ');

  return {
    kind: 'shell',
    label: input.taskName,
    sourceType: 'task',
    commandLine,
    cwd: resolveTaskCwd(input.scopePath, taskPath),
    metadata: {
      taskName: input.taskName,
      taskType: input.definitionType,
      npmScript: script,
      taskPath
    }
  };
}

function resolveTaskCwd(scopePath: string | undefined, taskPath: string | undefined): string | undefined {
  if (!taskPath) {
    return scopePath;
  }

  if (path.isAbsolute(taskPath) || !scopePath) {
    return taskPath;
  }

  return path.resolve(scopePath, taskPath);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const stringValue = readString(entry);
    return stringValue ? [stringValue] : [];
  });
}

function quoteShellToken(value: string): string {
  if (value.length === 0) {
    return '""';
  }

  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}
