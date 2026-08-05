import hostApiSchema from '../schema/host-api.schema.json' with { type: 'json' };

export interface PluginHostApiSchema {
  readonly $schema: string;
  readonly $id: string;
  readonly title: string;
  readonly description: string;
  readonly [key: string]: unknown;
}

const publicHostApiSchema: PluginHostApiSchema = hostApiSchema;

export { publicHostApiSchema as hostApiSchema };
export default publicHostApiSchema;
