import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build this package on Windows x64.');
const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const runtimeVersion = 'v26.11.1';
const runtimeHash = 'a619e2e09eb0d50ef4c733d678b4d22689d2afef138cd67fd3fa107b535f8819';
const packageName = 'Spool-' + version + '-Windows-x64';
const staging = await mkdtemp(path.join(tmpdir(), 'spool-build-'));
const bundle = path.join(staging, packageName);
const app = path.join(bundle, 'app');
const code = path.join(app, 'versions', version);
const runtime = path.join(bundle, 'runtime');
const output = path.join(root, 'release');
const hash = value => createHash('sha256').update(value).digest('hex');

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error('Build dependency unavailable: ' + url);
  return Buffer.from(await response.arrayBuffer());
}

try {
  await mkdir(path.join(code, 'public'), { recursive: true });
  await mkdir(runtime);
  await mkdir(output, { recursive: true });
  let node = await readFile(process.execPath);
  if (hash(node) !== runtimeHash) node = await download('https://nodejs.org/dist/' + runtimeVersion + '/win-x64/node.exe');
  if (hash(node) !== runtimeHash) throw new Error('The Node.js runtime checksum did not match.');
  await writeFile(path.join(runtime, 'node.exe'), node);
  await writeFile(path.join(runtime, 'LICENSE.txt'), await download('https://raw.githubusercontent.com/nodejs/node/' + runtimeVersion + '/LICENSE'));
  const files = ['server.mjs', 'media.mjs', 'setup.mjs', 'updates.mjs', 'public/app.js', 'public/style.css', 'public/index.html', 'public/icon.svg', 'public/cassette.webp'];
  const patchName = 'Spool-Enable-Updates.zip';
  if (process.argv.includes('--from-patch')) {
    execFileSync('tar.exe', ['-xf', path.join(root, patchName), '-C', bundle]);
    await copyFile(path.join(root, patchName), path.join(output, patchName));
  } else {
    await copyFile(path.join(root, 'packaging/bootstrap.mjs'), path.join(app, 'server.mjs'));
    for (const file of files) await copyFile(path.join(root, file), path.join(code, file));
    await writeFile(path.join(code, 'package.json'), JSON.stringify({name:'spool-downloader', type:'module', version}));
    execFileSync('tar.exe', ['-a', '-cf', path.join(output, patchName), '-C', bundle, 'app']);
  }
  const metadata = JSON.parse(await readFile(path.join(code, 'package.json'), 'utf8'));
  if (metadata.version !== version) throw new Error('The patch and release versions do not match.');
  const payload = { schema: 1, version, files: [] };
  for (const name of [...files, 'package.json']) {
    const contents = await readFile(path.join(code, name));
    payload.files.push({ name, contents: contents.toString('base64') });
  }
  await writeFile(path.join(output, 'Spool-update-v' + version + '.json.gz'), gzipSync(JSON.stringify(payload)));
  for (const file of ['Open Spool.cmd', 'Start here.txt']) {
    const source = await readFile(path.join(root, 'packaging', file), 'utf8');
    await writeFile(path.join(bundle, file), source.replace(/\r?\n/g, '\r\n') + '\r\n');
  }
  const zip = path.join(staging, packageName + '.zip');
  execFileSync('tar.exe', ['-a','-cf',zip,'-C',staging,packageName], { stdio: 'inherit' });
  const final = path.join(output, packageName + '.zip');
  const temp = final + '.' + process.pid + '.part';
  await copyFile(zip, temp);
  await rename(temp, final);
  console.log(final);
  console.log('SHA-256 ' + hash(await readFile(final)));
} finally {
  await rm(staging, { recursive: true, force: true });
}
