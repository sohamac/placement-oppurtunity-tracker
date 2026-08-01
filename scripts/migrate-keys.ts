// scripts/migrate-keys.ts
import { prisma } from '../lib/prisma';
import { encrypt } from '../lib/crypto';

async function migrate() {
  const users = await prisma.user.findMany({
    where: { geminiApiKey: { not: null } },
  });

  for (const user of users) {
    if (!user.geminiApiKey) continue;
    // Heuristic: encrypted keys are base64 and > 50 chars
    if (user.geminiApiKey.length > 50) continue;

    const encrypted = encrypt(user.geminiApiKey);
    await prisma.user.update({
      where: { id: user.id },
      data: { geminiApiKey: encrypted },
    });
    console.log(`Encrypted key for ${user.email}`);
  }

  console.log('Migration complete.');
  await prisma.$disconnect();
}

migrate();
