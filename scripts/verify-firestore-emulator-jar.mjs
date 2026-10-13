import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

const [jarPath, expectedSizeText, expectedSha256] = process.argv.slice(2);
if (!jarPath || !expectedSizeText || !expectedSha256) {
  console.error('Usage: node verify-firestore-emulator-jar.mjs <jar-path> <expected-size> <expected-sha256>');
  process.exit(2);
}

const expectedSize = Number(expectedSizeText);
const hash = createHash('sha256');
let size = 0;
try {
  for await (const chunk of createReadStream(jarPath)) {
    size += chunk.length;
    hash.update(chunk);
  }
} catch (error) {
  console.error(`Unable to read cached Firestore Emulator JAR: ${error.message}`);
  process.exit(1);
}

const actualSha256 = hash.digest('hex').toUpperCase();
if (size !== expectedSize || actualSha256 !== expectedSha256.toUpperCase()) {
  console.error(`Pinned JAR mismatch (size=${size}, sha256=${actualSha256}).`);
  process.exit(1);
}

console.log(`Pinned Firestore Emulator JAR verified (size=${size}, sha256=${actualSha256}).`);
