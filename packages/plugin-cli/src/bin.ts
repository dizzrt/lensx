#!/usr/bin/env node
import { runPluginCli } from './runner.js';

process.exitCode = await runPluginCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
});
