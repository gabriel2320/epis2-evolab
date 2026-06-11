import { describe, expect, it } from 'vitest';
import { computeUcbScore, rewardFromValidRate, selectBestArm, type BanditArm } from './ucb.js';

describe('bandit UCB', () => {
  it('brazo sin pulls tiene UCB infinito', () => {
    expect(computeUcbScore({ pulls: 0, totalReward: 0 }, 10)).toBe(Number.POSITIVE_INFINITY);
  });

  it('selecciona brazo con mayor UCB', () => {
    const arms: BanditArm[] = [
      {
        taskType: 'mutate_amplitude',
        modelName: 'a',
        pulls: 10,
        totalReward: 9,
        meanReward: 0.9,
        ucb: 0.95,
      },
      {
        taskType: 'mutate_amplitude',
        modelName: 'b',
        pulls: 1,
        totalReward: 0.5,
        meanReward: 0.5,
        ucb: 1.5,
      },
    ];
    expect(selectBestArm(arms)?.modelName).toBe('b');
  });

  it('rewardFromValidRate clamp 0-1', () => {
    expect(rewardFromValidRate(9, 10)).toBe(0.9);
    expect(rewardFromValidRate(0, 0)).toBe(0);
  });
});
