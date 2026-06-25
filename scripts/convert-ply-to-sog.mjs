import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRootDir = path.resolve(__dirname, '..');
const apiRootDir = path.resolve(repoRootDir, 'apps', 'api');

function printUsage() {
  console.error('Usage: npm run convert:ply -- <input.ply> [output.sog]');
}

function resolveProjectPath(...parts) {
  return path.resolve(process.cwd(), ...parts);
}

function defaultOutputPath(inputPath) {
  const inputName = path.basename(inputPath, path.extname(inputPath));
  return resolveProjectPath('apps', 'web', 'public', 'assets', 'converted', `${inputName}.sog`);
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function assertInputFile(inputPath) {
  let stats;

  try {
    stats = await fs.stat(inputPath);
  } catch (error) {
    throw new Error(`Input file does not exist: ${inputPath}`, { cause: error });
  }

  if (!stats.isFile()) {
    throw new Error(`Input path is not a file: ${inputPath}`);
  }

  if (path.extname(inputPath).toLowerCase() !== '.ply') {
    throw new Error(`Input file must be a .ply file: ${inputPath}`);
  }
}

async function findPackageRootFromEntry(packageName) {
  const entry = require.resolve(packageName, {
    paths: [apiRootDir, repoRootDir]
  });

  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    const packageJsonPath = path.join(dir, 'package.json');

    try {
      await fs.access(packageJsonPath);
      return dir;
    } catch {
      dir = path.dirname(dir);
    }
  }

  throw new Error(`Cannot find package root for ${packageName}`);
}

async function resolveCliEntry() {
  const packageRoot = await findPackageRootFromEntry('@playcanvas/splat-transform');
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const bin = packageJson.bin;
  const binRel = typeof bin === 'string'
    ? bin
    : bin?.['splat-transform'] || Object.values(bin || {})[0];

  if (!binRel) {
    throw new Error('@playcanvas/splat-transform does not expose a CLI bin');
  }

  return path.resolve(packageRoot, binRel);
}

async function runSplatTransform(inputPath, outputPath) {
  const cliEntry = await resolveCliEntry();

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry, inputPath, outputPath], {
      cwd: repoRootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.once('error', (error) => {
      reject(new Error('Failed to start @playcanvas/splat-transform CLI.', { cause: error }));
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`splat-transform exited because of signal: ${signal}\n${stderr || stdout}`.trim()));
        return;
      }

      reject(new Error(`splat-transform exited with code: ${code}\n${stderr || stdout}`.trim()));
    });
  });
}

async function main() {
  const [, , inputArg, outputArg] = process.argv;

  if (!inputArg) {
    printUsage();
    throw new Error('Missing input .ply path.');
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = outputArg
    ? path.resolve(process.cwd(), outputArg)
    : defaultOutputPath(inputPath);

  console.log('[convert:ply] Starting PLY -> SOG conversion');
  console.log(`[convert:ply] Input: ${inputPath}`);
  console.log(`[convert:ply] Output: ${outputPath}`);
  console.log(`[convert:ply] CWD: ${repoRootDir}`);

  await assertInputFile(inputPath);
  await ensureParentDirectory(outputPath);
  await runSplatTransform(inputPath, outputPath);
  const outputStats = await fs.stat(outputPath);
  if (!outputStats.size || outputStats.size <= 0) {
    throw new Error(`Converted SOG file is empty: ${outputPath}`);
  }

  console.log('[convert:ply] Conversion completed successfully.');
}

try {
  await main();
} catch (error) {
  console.error('[convert:ply] Conversion failed.');
  console.error(error);
  throw error;
}
