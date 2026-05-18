export async function generateUniqueUsername(
  baseUsername: string,
  isTaken: (username: string) => Promise<boolean>,
): Promise<string> {
  const clean = baseUsername.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
  if (!clean) throw new Error('Cannot generate username from empty base');

  if (!(await isTaken(clean))) return clean;

  for (let i = 1; i <= 100; i++) {
    const candidate = i === 1 ? `${clean}-1` : `${clean.slice(0, 28)}-${i}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error('Unable to generate unique username after 100 attempts');
}
