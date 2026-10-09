// Runs the Android Gradle wrapper: node scripts/gradle.ts assembleDebug
//
// If android/local.properties has a java.home entry, Gradle runs on that JDK.
// Capacitor needs JDK 21, and this avoids changing the system-wide Java.
// Write the path with forward slashes: java.home=C:/Users/me/.jdks/temurin-21

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const androidDir = fileURLToPath(new URL('../android/', import.meta.url));
const env = { ...process.env };

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
