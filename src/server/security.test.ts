import { hashSecret, verifySecret } from './security';

test('secret KDF work leaves the event loop responsive', async () => {
  const startedAt = Date.now();
  const timer = new Promise<number>((resolve) => {
    setTimeout(() => resolve(Date.now() - startedAt), 0);
  });
  const hashing = Array.from({ length: 8 }, (_, index) =>
    hashSecret(`secret-${index}`),
  );

  await expect(timer).resolves.toBeLessThan(100);
  const [storedHash] = await Promise.all(hashing);

  const correctVerification = verifySecret('secret-0', storedHash);
  const wrongVerification = verifySecret('9999', storedHash);

  await expect(correctVerification).resolves.toBe(true);
  await expect(wrongVerification).resolves.toBe(false);
});
