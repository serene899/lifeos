import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach } from 'vitest';
import { switchDatabase, db } from '../../src/lib/db';

(globalThis as unknown as { Blob: unknown }).Blob = NodeBlob;
if (!globalThis.crypto?.subtle) (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;

let n = 0;
beforeEach(() => {
  switchDatabase(`life-kline-test-${process.pid}-${++n}`);
});
afterEach(async () => {
  db.close();
  await db.delete();
});
