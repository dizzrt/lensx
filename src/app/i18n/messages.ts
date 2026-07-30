import enUSResource from './messages/en-US.json';
import zhCNResource from './messages/zh-CN.json';

type MessageKeyPath<Resource> = {
  [Key in Extract<keyof Resource, string>]: Resource[Key] extends string
    ? Key
    : Resource[Key] extends Record<string, unknown>
      ? `${Key}.${MessageKeyPath<Resource[Key]>}`
      : never;
}[Extract<keyof Resource, string>];

export const enUSMessages = enUSResource;
export const zhCNMessages: typeof enUSMessages = zhCNResource;

export type AppMessageKey = MessageKeyPath<typeof enUSMessages>;
