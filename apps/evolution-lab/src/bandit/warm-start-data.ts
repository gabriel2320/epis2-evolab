export const SPRINT8_WARM_START = [
  {
    taskType: 'mutate_amplitude' as const,
    modelName: 'qwen2.5-coder:7b',
    pulls: 25,
    totalReward: 22.5,
    warmStartSource: 'sprint8-gate',
  },
  {
    taskType: 'mutate_amplitude' as const,
    modelName: 'qwen3:8b',
    pulls: 1,
    totalReward: 0.5,
    warmStartSource: 'sprint8-gate',
  },
  {
    taskType: 'mutate_depth' as const,
    modelName: 'qwen2.5-coder:14b',
    pulls: 25,
    totalReward: 23.0,
    warmStartSource: 'sprint8-gate',
  },
  {
    taskType: 'mutate_depth' as const,
    modelName: 'qwen2.5-coder:7b',
    pulls: 1,
    totalReward: 0.3,
    warmStartSource: 'sprint8-gate',
  },
  {
    taskType: 'mutate_repair' as const,
    modelName: 'qwen2.5-coder:14b',
    pulls: 1,
    totalReward: 1.0,
    warmStartSource: 'sprint8-gate',
  },
  {
    taskType: 'mutate_repair' as const,
    modelName: 'deepseek-coder-v2:16b',
    pulls: 1,
    totalReward: 0.0,
    warmStartSource: 'sprint8-gate',
  },
  {
    taskType: 'judge_triage' as const,
    modelName: 'qwen3:8b',
    pulls: 1,
    totalReward: 0.5,
    warmStartSource: 'judge-golden-v1',
  },
  {
    taskType: 'judge_triage' as const,
    modelName: 'qwen2.5-coder:7b',
    pulls: 1,
    totalReward: 0.4,
    warmStartSource: 'judge-golden-v1',
  },
  {
    taskType: 'judge_triage' as const,
    modelName: 'llama3.2',
    pulls: 1,
    totalReward: 0.3,
    warmStartSource: 'judge-golden-v1',
  },
] as const;

export const BANDIT_TASK_MODELS: Record<string, string[]> = {
  mutate_amplitude: ['qwen2.5-coder:7b', 'qwen3:8b'],
  mutate_depth: ['qwen2.5-coder:14b', 'qwen2.5-coder:7b'],
  mutate_repair: ['qwen2.5-coder:14b', 'deepseek-coder-v2:16b'],
  judge_triage: ['qwen3:8b', 'qwen2.5-coder:7b', 'llama3.2'],
  scenario_authoring: ['qwen2.5-coder:14b', 'qwen3:8b'],
};
