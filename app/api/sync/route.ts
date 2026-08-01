import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchUnreadPlacementEmails } from '@/services/email';
import { extractPlacementDetails } from '@/services/ai';
import { getValidAccessToken } from './cron/route';

// ── Concurrency helper ──
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { accounts: true }
    });

    const googleAccount = user?.accounts.find(a => a.provider === 'google');
    if (!googleAccount) {
      return NextResponse.json({ error: 'No Google account connected' }, { status: 400 });
    }

    const accessToken = await getValidAccessToken(googleAccount);
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to refresh Google token. Please log in again.' }, { status: 401 });
    }

    const existingEmails = await prisma.placementEmail.findMany({
      where: {
        userId: user.id,
        NOT: [
          { summary: { contains: "Could not extract details" } },
          { summary: { contains: "AI Error" } }
        ]
      },
      select: { emailId: true }
    });
    const existingIds = existingEmails.map(e => e.emailId);

    const emails = await fetchUnreadPlacementEmails(accessToken, existingIds);
    if (emails.length === 0) {
      return NextResponse.json({ success: true, processedCount: 0, providers: [] });
    }

    const providersUsed = new Set<string>();

    // ── PARALLEL AI PROCESSING: 3 at a time ──
    await mapWithConcurrency(emails, 3, async (email) => {
      const details = await extractPlacementDetails(email.body, {
        preferredProvider: (user.aiProvider as any) || 'auto',
        userGeminiKey: user.geminiApiKey,
      });

      providersUsed.add((details as any)._provider || 'unknown');
      if (details.is_placement_related === false) return;

      let normalizedStatus = 'Applied';
      if (details.status) {
        const titleCase =
          details.status.charAt(0).toUpperCase() +
          details.status.slice(1).toLowerCase();
        if (['Applied', 'Shortlisted', 'Interviewing', 'Rejected'].includes(titleCase)) {
          normalizedStatus = titleCase;
        }
      }

      await prisma.placementEmail.upsert({
        where: { emailId: email.id },
        update: {
          company: details.company ?? undefined,
          role: details.role ?? undefined,
          summary: details.summary,
          status: normalizedStatus,
        },
        create: {
          userId: user.id,
          emailId: email.id,
          subject: email.subject,
          company: details.company,
          role: details.role,
          status: normalizedStatus,
          date: email.receivedDate,
          time: email.receivedTime,
          summary: details.summary,
        },
      });
    });

    return NextResponse.json({ 
      success: true, 
      processedCount: emails.length,
      providers: Array.from(providersUsed)
    });
  } catch (error) {
    console.error("Error during sync:", error);
    return NextResponse.json({ error: "Failed to sync emails" }, { status: 500 });
  }
}
