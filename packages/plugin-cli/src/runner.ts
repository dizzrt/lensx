import { PluginCliCommandError } from './command-error.js';
import { createPluginProject } from './create.js';
import { cliDiagnostic, diagnosticFromUnknownError } from './diagnostics.js';
import { createEnvelope, renderHumanEnvelope, serializeEnvelope } from './output.js';
import { inspectPluginPackageFile, packPluginProject } from './package-commands.js';
import { parsePluginCliArguments } from './parser.js';
import { buildPluginProject, validatePluginProject } from './project.js';
import {
  type ParsedPluginCliInvocation,
  PLUGIN_CLI_VERSION,
  type PluginCliEnvelope,
  type PluginCliExitCode,
} from './types.js';

export interface PluginCliIo {
  readonly cwd: string;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

const exitCodeFor = (envelope: PluginCliEnvelope): PluginCliExitCode => {
  if (envelope.status === 'success' || envelope.status === 'compatible') return 0;
  if (envelope.status === 'invalid' || envelope.status === 'incompatible') return 1;
  if (envelope.status === 'usage_error') return 2;
  return 3;
};

const executeInvocation = async (
  invocation: ParsedPluginCliInvocation,
  io: PluginCliIo,
): Promise<PluginCliEnvelope> => {
  if (invocation.command === 'help') return createEnvelope('help', 'success', {});
  if (invocation.command === 'version') return createEnvelope('version', 'success', { version: PLUGIN_CLI_VERSION });
  if (invocation.command === 'create') {
    return createEnvelope('create', 'success', { ...(await createPluginProject({ cwd: io.cwd, ...invocation })) });
  }
  if (invocation.command === 'build') {
    return createEnvelope(
      'build',
      'success',
      await buildPluginProject({
        cwd: io.cwd,
        project: invocation.project,
        json: invocation.json,
        writeStdout: io.stdout,
        writeStderr: io.stderr,
      }),
    );
  }
  if (invocation.command === 'validate') {
    const validated = await validatePluginProject(io.cwd, invocation.project);
    return createEnvelope('validate', validated.inspection.status, {
      project: validated.project.callerPath,
      plugin_id: validated.inspection.manifest.plugin_id,
      version: validated.inspection.manifest.version,
      runtime_kind: validated.inspection.manifest.runtime.kind,
      page_presentations: validated.inspection.manifest.contributes.pages.map(({ id, presentation }) => ({
        page_id: id,
        initial_size: presentation.initial_size,
        resizable: presentation.resizable,
      })),
      package_protocol: validated.inspection.facts.packageFormatVersion,
      compatibility: validated.inspection.compatibility,
      file_count: validated.inspection.facts.fileCount,
      decompressed_size: validated.inspection.facts.decompressedSize,
    });
  }
  if (invocation.command === 'pack') {
    return createEnvelope(
      'pack',
      'success',
      await packPluginProject({
        cwd: io.cwd,
        project: invocation.project,
        output: invocation.output,
        noBuild: invocation.noBuild,
        json: invocation.json,
        writeStdout: io.stdout,
        writeStderr: io.stderr,
      }),
    );
  }
  if (invocation.command === 'inspect') {
    const inspected = await inspectPluginPackageFile(io.cwd, invocation.file);
    return createEnvelope('inspect', inspected.status, inspected.result);
  }
  const { json: _json, locale: _locale, ...commandArguments } = invocation;
  return createEnvelope(invocation.command, 'success', { parsed: commandArguments });
};

export const runPluginCli = async (arguments_: readonly string[], io: PluginCliIo): Promise<PluginCliExitCode> => {
  const parsed = parsePluginCliArguments(arguments_);
  if (!('invocation' in parsed)) {
    const commandCandidate = arguments_.find((argument) => !argument.startsWith('-'));
    const command = ['create', 'build', 'validate', 'pack', 'inspect'].includes(commandCandidate ?? '')
      ? (commandCandidate as 'create' | 'build' | 'validate' | 'pack' | 'inspect')
      : 'help';
    const envelope = createEnvelope(command, 'usage_error', {}, parsed.diagnostics);
    (parsed.json ? io.stdout : io.stderr)(
      parsed.json ? serializeEnvelope(envelope) : renderHumanEnvelope(envelope, parsed.locale),
    );
    return 2;
  }
  try {
    const envelope = await executeInvocation(parsed.invocation, io);
    io.stdout(
      parsed.invocation.json ? serializeEnvelope(envelope) : renderHumanEnvelope(envelope, parsed.invocation.locale),
    );
    return exitCodeFor(envelope);
  } catch (error) {
    const envelope =
      error instanceof PluginCliCommandError
        ? createEnvelope(parsed.invocation.command, error.status, {}, error.diagnostics)
        : createEnvelope(parsed.invocation.command, 'operational_error', {}, [diagnosticFromUnknownError(error)]);
    (parsed.invocation.json ? io.stdout : io.stderr)(
      parsed.invocation.json ? serializeEnvelope(envelope) : renderHumanEnvelope(envelope, parsed.invocation.locale),
    );
    return exitCodeFor(envelope);
  }
};

export { cliDiagnostic, exitCodeFor };
