export async function generateUniqueUsername(
  baseUsername: string,
  isTaken: (username: string) => Promise<boolean>,
): Promise<string> {
  const clean = baseUsername.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
  if (!clean) throw new Error('Cannot generate username from empty base');

  if (!(await isTaken(clean))) return clean;

  for (let i = 1; i <= 100; i++) {
    const suffix = `-${i}`;
    const maxBase = 30 - suffix.length;
    const candidate = `${clean.slice(0, maxBase)}${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error('Unable to generate unique username after 100 attempts');
}
