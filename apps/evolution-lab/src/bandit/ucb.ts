export type BanditTaskType =
  | 'mutate_amplitude'
  | 'mutate_repair'
  | 'mutate_depth'
  | 'judge_triage'
  | 'scenario_authoring';

export type BanditArm = {
  taskType: BanditTaskType;
  modelName: string;
  pulls: number;
  totalReward: number;
  lastReward?: number;
  meanReward: number;
  ucb: number;
};

export function computeUcbScore(
  arm: { pulls: number; totalReward: number },
  totalPullsTask: number,
  explorationC = Math.SQRT2,
): number {
  if (arm.pulls === 0) return Number.POSITIVE_INFINITY;
  const mean = arm.totalReward / arm.pulls;
  const exploration = explorationC * Math.sqrt(Math.log(Math.max(totalPullsTask, 1)) / arm.pulls);
  return mean + exploration;
}

export function selectBestArm(arms: BanditArm[]): BanditArm | null {
  if (arms.length === 0) return null;
  return arms.reduce((best, cur) => (cur.ucb > best.ucb ? cur : best));
}

export function rewardFromValidRate(valid: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, valid / total));
}
