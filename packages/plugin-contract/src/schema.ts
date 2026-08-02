import manifestSchema from '../schema/manifest.schema.json' with { type: 'json' };

export interface PluginManifestSchema {
  readonly $schema: string;
  readonly $id: string;
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

const publicManifestSchema: PluginManifestSchema = manifestSchema;

export { publicManifestSchema as manifestSchema };
export default publicManifestSchema;
