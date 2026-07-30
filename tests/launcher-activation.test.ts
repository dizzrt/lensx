import { describe, expect, test } from '@rstest/core';
import { LAUNCHER_ACTIVATED_EVENT, parseLauncherActivationPayload } from '../src/app/launcher/activation';

describe('launcher activation contract', () => {
  test('uses the stable desktop event name and parses supported reasons', () => {
    expect(LAUNCHER_ACTIVATED_EVENT).toBe('launcher://activated');
    expect(parseLauncherActivationPayload({ reason: 'startup' })).toEqual({
      reason: 'startup',
    });
    expect(parseLauncherActivationPayload({ reason: 'global_shortcut' })).toEqual({
      reason: 'global_shortcut',
    });
    expect(parseLauncherActivationPayload({ reason: 'programmatic' })).toEqual({
      reason: 'programmatic',
    });
  });

  test('rejects malformed and unknown activation payloads', () => {
    expect(() => parseLauncherActivationPayload(null)).toThrow('Launcher activation payload must be an object.');
    expect(() => parseLauncherActivationPayload({})).toThrow('Launcher activation reason is invalid: undefined');
    expect(() => parseLauncherActivationPayload({ reason: 'unknown' })).toThrow(
      'Launcher activation reason is invalid: unknown',
    );
  });
});
