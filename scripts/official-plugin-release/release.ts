import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  canonicalJson,
  type OfficialPluginCandidateManifest,
  type OfficialPluginReleaseRecord,
  validateReleaseRecord,
  verifyCandidateDirectory,
} from './candidate.ts';

export interface ReleaseAsset {
  readonly id: number;
  readonly name: string;
  readonly size: number;
}

export interface ReleaseState {
  readonly assets: readonly ReleaseAsset[];
  readonly draft: boolean;
  readonly id: number;
  readonly tag: string;
}

export interface GitHubReleaseApi {
  readonly createDraft: (tag: string, commit: string) => Promise<ReleaseState>;
  readonly createTag: (tag: string, commit: string) => Promise<void>;
  readonly downloadAsset: (asset: ReleaseAsset) => Promise<Uint8Array>;
  readonly getRelease: (tag: string) => Promise<ReleaseState | undefined>;
  readonly getTagCommit: (tag: string) => Promise<string | undefined>;
  readonly listAssets: (releaseId: number) => Promise<readonly ReleaseAsset[]>;
  readonly listReleaseTags: () => Promise<readonly string[]>;
  readonly publish: (releaseId: number) => Promise<void>;
  readonly uploadAsset: (releaseId: number, name: string, bytes: Uint8Array) => Promise<ReleaseAsset>;
}

export interface PublishResult {
  readonly status: 'idempotent' | 'published';
  readonly tag: string;
}

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const compareSemver = (left: string, right: string): number => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const releaseAssets = (
  directory: string,
  candidate: OfficialPluginCandidateManifest,
): ReadonlyMap<string, Uint8Array> =>
  new Map(
    [candidate.artifact.name, candidate.checksum.name, candidate.release_record.name]
      .sort()
      .map((name) => [name, readFileSync(join(directory, name))]),
  );

const verifyRemoteAssets = async (
  api: GitHubReleaseApi,
  releaseId: number,
  expected: ReadonlyMap<string, Uint8Array>,
  allowMissing: boolean,
): Promise<Map<string, ReleaseAsset>> => {
  const actual = new Map((await api.listAssets(releaseId)).map((asset) => [asset.name, asset]));
  for (const name of actual.keys()) {
    if (!expected.has(name)) {
      throw new Error('[official-release/asset-set-conflict] Existing release contains an unexpected asset.');
    }
  }
  for (const [name, bytes] of expected) {
    const asset = actual.get(name);
    if (asset === undefined) {
      if (!allowMissing) throw new Error('[official-release/asset-missing] Existing release is incomplete.');
      continue;
    }
    if (asset.size !== bytes.length || !equalBytes(await api.downloadAsset(asset), bytes)) {
      throw new Error('[official-release/asset-digest-conflict] Existing release asset differs from candidate bytes.');
    }
  }
  return actual;
};

export const publishCandidateDirectory = async (
  directory: string,
  expectedCommit: string,
  api: GitHubReleaseApi,
): Promise<PublishResult> => {
  const candidate = verifyCandidateDirectory(directory);
  const recordValue = JSON.parse(readFileSync(join(directory, candidate.release_record.name), 'utf8')) as unknown;
  if (
    !validateReleaseRecord(recordValue) ||
    canonicalJson(recordValue) !== readFileSync(join(directory, candidate.release_record.name), 'utf8')
  ) {
    throw new Error('[official-release/release-record-invalid] Release record failed publish revalidation.');
  }
  const record: OfficialPluginReleaseRecord = recordValue;
  if (record.source_commit !== expectedCommit) {
    throw new Error('[official-release/source-commit-conflict] Candidate source commit does not match publish input.');
  }
  const expectedAssets = releaseAssets(directory, candidate);
  const pluginTagPrefix = `official/${record.plugin_id}/v`;
  const publishedVersions = (await api.listReleaseTags())
    .filter((tag) => tag.startsWith(pluginTagPrefix))
    .map((tag) => tag.slice(pluginTagPrefix.length))
    .filter((version) => /^\d+\.\d+\.\d+$/u.test(version));
  if (publishedVersions.some((version) => compareSemver(version, record.version) > 0)) {
    throw new Error('[official-release/semver-rollback] A newer plugin release already exists.');
  }
  const tagCommit = await api.getTagCommit(record.release_tag);
  if (tagCommit !== undefined && tagCommit !== expectedCommit) {
    throw new Error('[official-release/tag-commit-conflict] Existing release tag points to another commit.');
  }
  let release = await api.getRelease(record.release_tag);
  if (release !== undefined && !release.draft) {
    await verifyRemoteAssets(api, release.id, expectedAssets, false);
    return { status: 'idempotent', tag: record.release_tag };
  }
  if (tagCommit === undefined) await api.createTag(record.release_tag, expectedCommit);
  release ??= await api.createDraft(record.release_tag, expectedCommit);
  const existing = await verifyRemoteAssets(api, release.id, expectedAssets, true);
  for (const [name, bytes] of expectedAssets) {
    if (!existing.has(name)) await api.uploadAsset(release.id, name, bytes);
  }
  await verifyRemoteAssets(api, release.id, expectedAssets, false);
  await api.publish(release.id);
  return { status: 'published', tag: record.release_tag };
};

interface GitHubAssetPayload {
  readonly id: number;
  readonly name: string;
  readonly size: number;
}

interface GitHubReleasePayload {
  readonly assets?: readonly GitHubAssetPayload[];
  readonly draft: boolean;
  readonly id: number;
  readonly tag_name: string;
}

const assetFromPayload = (value: GitHubAssetPayload): ReleaseAsset => ({
  id: value.id,
  name: value.name,
  size: value.size,
});
const releaseFromPayload = (value: GitHubReleasePayload): ReleaseState => ({
  assets: (value.assets ?? []).map(assetFromPayload),
  draft: value.draft,
  id: value.id,
  tag: value.tag_name,
});

export class GitHubRestReleaseApi implements GitHubReleaseApi {
  readonly #apiBase: string;
  readonly #owner: string;
  readonly #repository: string;
  readonly #token: string;

  constructor({ repositoryUrl, token }: { readonly repositoryUrl: string; readonly token: string }) {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/u.exec(repositoryUrl);
    if (match?.[1] === undefined || match[2] === undefined || token.length === 0) {
      throw new Error('[official-release/github-context-invalid] GitHub repository or token is unavailable.');
    }
    this.#owner = match[1];
    this.#repository = match[2];
    this.#token = token;
    this.#apiBase = `https://api.github.com/repos/${this.#owner}/${this.#repository}`;
  }

  async #request(path: string, init: RequestInit = {}, allowMissing = false): Promise<Response> {
    const response = await fetch(`${this.#apiBase}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.#token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...init.headers,
      },
    });
    if (allowMissing && response.status === 404) return response;
    if (!response.ok)
      throw new Error(`[official-release/github-api-failed] GitHub API request failed with status ${response.status}.`);
    return response;
  }

  async getTagCommit(tag: string): Promise<string | undefined> {
    const response = await this.#request(`/git/ref/tags/${encodeURIComponent(tag)}`, {}, true);
    if (response.status === 404) return undefined;
    const value = (await response.json()) as { object?: { sha?: unknown } };
    return typeof value.object?.sha === 'string' ? value.object.sha : undefined;
  }

  async createTag(tag: string, commit: string): Promise<void> {
    await this.#request('/git/refs', {
      body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: commit }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  }

  async getRelease(tag: string): Promise<ReleaseState | undefined> {
    const response = await this.#request(`/releases/tags/${encodeURIComponent(tag)}`, {}, true);
    return response.status === 404 ? undefined : releaseFromPayload((await response.json()) as GitHubReleasePayload);
  }

  async createDraft(tag: string, commit: string): Promise<ReleaseState> {
    const response = await this.#request('/releases', {
      body: JSON.stringify({
        draft: true,
        generate_release_notes: true,
        name: tag,
        tag_name: tag,
        target_commitish: commit,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return releaseFromPayload((await response.json()) as GitHubReleasePayload);
  }

  async listAssets(releaseId: number): Promise<readonly ReleaseAsset[]> {
    const response = await this.#request(`/releases/${releaseId}/assets?per_page=100`);
    return ((await response.json()) as GitHubAssetPayload[])
      .map(assetFromPayload)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listReleaseTags(): Promise<readonly string[]> {
    const response = await this.#request('/releases?per_page=100');
    return ((await response.json()) as GitHubReleasePayload[]).map((release) => release.tag_name).sort();
  }

  async uploadAsset(releaseId: number, name: string, bytes: Uint8Array): Promise<ReleaseAsset> {
    const response = await fetch(
      `https://uploads.github.com/repos/${this.#owner}/${this.#repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      {
        body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.#token}`,
          'Content-Type': 'application/octet-stream',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        method: 'POST',
      },
    );
    if (!response.ok)
      throw new Error(
        `[official-release/github-upload-failed] GitHub asset upload failed with status ${response.status}.`,
      );
    return assetFromPayload((await response.json()) as GitHubAssetPayload);
  }

  async downloadAsset(asset: ReleaseAsset): Promise<Uint8Array> {
    const response = await this.#request(`/releases/assets/${asset.id}`, {
      headers: { Accept: 'application/octet-stream' },
    });
    return new Uint8Array(await response.arrayBuffer());
  }

  async publish(releaseId: number): Promise<void> {
    await this.#request(`/releases/${releaseId}`, {
      body: JSON.stringify({ draft: false }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
  }
}
