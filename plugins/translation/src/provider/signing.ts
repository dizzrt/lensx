import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { TranslationInput } from './types.js';

export const TRANSLATION_ENDPOINT = 'https://translate.volcengineapi.com/';
export const TRANSLATION_QUERY = { Action: 'TranslateText', Version: '2020-06-01' } as const;
const encoder = new TextEncoder();
const hash = (value: string): string => bytesToHex(sha256(encoder.encode(value)));
const mac = (key: Uint8Array, value: string): Uint8Array => hmac(sha256, key, encoder.encode(value));
const uriEncode = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export const canonicalQuery = (query: Readonly<Record<string, string>>): string =>
  Object.keys(query)
    .sort()
    .map((key) => `${uriEncode(key)}=${uriEncode(query[key])}`)
    .join('&');

export interface SignedTranslationRequest {
  readonly url: string;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** Pure browser signing; only the returned body string is sent by the provider. */
export const signTranslationRequest = (input: TranslationInput, date: Date): SignedTranslationRequest => {
  const body = JSON.stringify({
    TargetLanguage: input.targetLanguage,
    TextList: [input.text],
    ...(input.sourceLanguage === 'auto' ? {} : { SourceLanguage: input.sourceLanguage }),
  });
  const query = canonicalQuery(TRANSLATION_QUERY);
  const timestamp = date.toISOString().replace(/[:-]|\.\d{3}/gu, '');
  const day = timestamp.slice(0, 8);
  const scope = `${day}/cn-north-1/translate/request`;
  const bodyHash = hash(body);
  // The official Node reference excludes content-type from the signed set.
  // Host participates in the signature but is supplied by the browser, never set manually.
  const headers = `host:translate.volcengineapi.com\nx-content-sha256:${bodyHash}\nx-date:${timestamp}\n`;
  const signedHeaders = 'host;x-content-sha256;x-date';
  const canonical = ['POST', '/', query, headers, signedHeaders, bodyHash].join('\n');
  const stringToSign = ['HMAC-SHA256', timestamp, scope, hash(canonical)].join('\n');
  const dateKey = mac(encoder.encode(input.credentials.secretAccessKey), day);
  const regionKey = mac(dateKey, 'cn-north-1');
  const serviceKey = mac(regionKey, 'translate');
  const signingKey = mac(serviceKey, 'request');
  const signature = bytesToHex(mac(signingKey, stringToSign));
  dateKey.fill(0);
  regionKey.fill(0);
  serviceKey.fill(0);
  signingKey.fill(0);
  return {
    url: `${TRANSLATION_ENDPOINT}?${query}`,
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Date': timestamp,
      'X-Content-Sha256': bodyHash,
      Authorization: `HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
};
