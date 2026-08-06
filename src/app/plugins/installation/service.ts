import type { LocalPluginInstallationClient, LocalPluginInstallationResult } from './types';

type PreparedResult = Extract<LocalPluginInstallationResult, { readonly status: 'prepared' }>;
type InstalledResult = Extract<LocalPluginInstallationResult, { readonly status: 'installed' }>;

export class LocalPluginInstallationServiceError extends Error {
  readonly code: 'destroyed' | 'invalid_current_state';
  constructor(code: LocalPluginInstallationServiceError['code']) {
    super(
      code === 'destroyed'
        ? 'Local plugin installation is unavailable.'
        : 'Local plugin installation preparation is not current.',
    );
    this.name = 'LocalPluginInstallationServiceError';
    this.code = code;
  }
}

export interface LocalPluginInstallationService {
  readonly prepare: () => Promise<
    Extract<LocalPluginInstallationResult, { readonly status: 'cancelled' | 'prepared' }>
  >;
  readonly commitPrepared: () => Promise<InstalledResult>;
  readonly cancelPrepared: () => Promise<void>;
  readonly destroy: () => Promise<void>;
}

export const createLocalPluginInstallationService = (
  client: LocalPluginInstallationClient,
): LocalPluginInstallationService => {
  let destroyed = false;
  let prepared: PreparedResult | undefined;
  const assertAlive = () => {
    if (destroyed) throw new LocalPluginInstallationServiceError('destroyed');
  };
  const cancel = async (token: string) => {
    try {
      await client.cancel(token);
    } finally {
      if (prepared?.preparation_token === token) prepared = undefined;
    }
  };
  return Object.freeze({
    async prepare() {
      assertAlive();
      if (prepared) await cancel(prepared.preparation_token);
      const result = await client.prepare();
      assertAlive();
      if (result.status === 'prepared') prepared = result;
      return result;
    },
    async commitPrepared() {
      assertAlive();
      const current = prepared;
      if (!current) throw new LocalPluginInstallationServiceError('invalid_current_state');
      prepared = undefined;
      return client.commit(current.preparation_token);
    },
    async cancelPrepared() {
      assertAlive();
      if (prepared) await cancel(prepared.preparation_token);
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      const current = prepared;
      if (current) await cancel(current.preparation_token).catch(() => undefined);
    },
  });
};
