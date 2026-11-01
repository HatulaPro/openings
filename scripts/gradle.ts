// Runs the Android Gradle wrapper: node scripts/gradle.ts assembleDebug
//
// If android/local.properties has a java.home entry, Gradle runs on that JDK.
// Capacitor needs JDK 21, and this avoids changing the system-wide Java.
// Write the path with forward slashes: java.home=C:/Users/me/.jdks/temurin-21
//
// If ANDROID_DEBUG_KEYSTORE_BASE64 is set, it is written to the debug keystore before the build.
// Every machine makes its own debug key, and the phone only accepts an update signed with the key
// of the installed app, so other machines (a cloud session) need the owner's key. The repository
// is public, so the key lives in that variable, never in git.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const androidDir = fileURLToPath(new URL('../android/', import.meta.url));
const env = { ...process.env };

const keystoreBase64 = process.env.ANDROID_DEBUG_KEYSTORE_BASE64?.trim();
if (keystoreBase64) {
  const key = Buffer.from(keystoreBase64, 'base64');
  // A PKCS12 keystore starts with a DER sequence, an old JKS one with FEEDFEED.
  if (key.length < 100 || !(key[0] === 0x30 || key.readUInt32BE(0) === 0xfeedfeed)) {
    console.error('ANDROID_DEBUG_KEYSTORE_BASE64 is not a base64 keystore.');
    process.exit(1);
  }
  // Where the Android Gradle plugin looks for the debug keystore.
  const dir = process.env.ANDROID_USER_HOME ?? join(homedir(), '.android');
  const file = join(dir, 'debug.keystore');
  const current = existsSync(file) ? readFileSync(file) : undefined;
  if (!current?.equals(key)) {
    mkdirSync(dir, { recursive: true });
    if (current) copyFileSync(file, file + '.bak');
    writeFileSync(file, key);
    console.log(`Wrote the debug keystore from ANDROID_DEBUG_KEYSTORE_BASE64 to ${file}`);
  }
}

const properties = androidDir + 'local.properties';
if (existsSync(properties)) {
  const javaHome = readFileSync(properties, 'utf8').match(/^java\.home=(.+)$/m)?.[1]?.trim();
  if (javaHome) env.JAVA_HOME = javaHome;
}

const args = process.argv.slice(2);
const result =
  process.platform === 'win32'
    ? // The full path, because package managers stop cmd from running files in the current directory.
      spawnSync('cmd.exe', ['/d', '/c', androidDir + 'gradlew.bat', ...args], { cwd: androidDir, env, stdio: 'inherit' })
    : spawnSync('./gradlew', args, { cwd: androidDir, env, stdio: 'inherit' });
process.exit(result.status ?? 1);
