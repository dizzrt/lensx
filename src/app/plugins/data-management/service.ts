import { parseClearPluginDataRequest } from './parse';
import {
  PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
  type PluginDataManagementDesktopAdapter,
  type PluginDataManagementService,
} from './types';

export const createPluginDataManagementService = (
  adapter: PluginDataManagementDesktopAdapter,
): PluginDataManagementService =>
  Object.freeze({
    clear: (input: Parameters<PluginDataManagementService['clear']>[0]) =>
      adapter.clear(
        parseClearPluginDataRequest({
          contract_version: PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
          entry_id: input.entry_id,
          expected_revision: input.expected_revision,
        }),
      ),
  });
