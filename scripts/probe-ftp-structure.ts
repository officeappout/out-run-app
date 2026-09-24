/**
 * scripts/probe-ftp-structure.ts — READ ONLY
 * Lists FTP directory structure to find where files actually live.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as ftp from 'basic-ftp';

async function listDir(client: ftp.Client, dir: string, depth = 0): Promise<void> {
  const indent = '  '.repeat(depth);
  try {
    const items = await client.list(dir);
    for (const item of items.slice(0, 8)) { // max 8 per dir to keep output short
      console.log(`${indent}${item.type === 2 ? '📁' : '📄'} ${item.name}  (${item.size ?? ''})`);
      if (item.type === 2 && depth < 2) {
        await listDir(client, `${dir}/${item.name}`, depth + 1);
      }
    }
    if (items.length > 8) console.log(`${indent}... (${items.length - 8} more)`);
  } catch (e) {
    console.log(`${indent}[cannot list: ${e}]`);
  }
}

async function main() {
  const host = (process.env.FTP_HOST ?? '').trim();
  const port = parseInt(process.env.FTP_PORT ?? '21', 10);
  const user = (process.env.FTP_USER ?? '').trim();
  const pass = (process.env.FTP_PASS ?? '').trim();

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({ host, port, user, password: pass, secure: false });

    // Print current (home) directory
    const pwd = await client.pwd();
    console.log(`\n📍 Home directory: ${pwd}`);

    // List home
    console.log('\n📁 Home contents:');
    await listDir(client, '/', 0);

    // Try the expected path directly
    const targetDir = '/home/backend/out-local-files/upload-files';
    console.log(`\n🔍 Checking target dir: ${targetDir}`);
    try {
      const files = await client.list(targetDir);
      console.log(`   Files in target dir: ${files.length}`);
      // Show a few sample filenames
      console.log('   Samples:');
      for (const f of files.slice(0, 5)) {
        console.log(`     ${f.name}  (${f.size} bytes)`);
      }
    } catch (e) {
      console.log(`   Cannot list target dir: ${e}`);

      // Try relative path
      console.log('\n🔍 Trying relative path: out-local-files/upload-files');
      try {
        const files2 = await client.list('out-local-files/upload-files');
        console.log(`   Files: ${files2.length}`);
        for (const f of files2.slice(0, 5)) console.log(`     ${f.name}`);
      } catch (e2) {
        console.log(`   Also failed: ${e2}`);
      }
    }

  } finally {
    client.close();
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
