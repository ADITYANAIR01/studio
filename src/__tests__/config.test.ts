import { describe, it, expect } from 'vitest';
import { appConfig } from '@/lib/config';

describe('Configuration fallback', () => {
  it('provides firebase config object', () => {
    expect(appConfig.firebase).toBeDefined();
    expect(typeof appConfig.firebase.apiKey).toBe('string');
  });

  it('has environment set', () => {
    expect(['development','production','test']).toContain(appConfig.environment);
  });
});
