import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchUnreadPlacementEmails } from '@/services/email';
import { extractPlacementDetails } from '@/services/ai';

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
    if (!googleAccount || !googleAccount.access_token) {
      return NextResponse.json({ error: 'No Google account connected' }, { status: 400 });
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

    const emails = await fetchUnreadPlacementEmails(googleAccount.access_token, existingIds);
    let processedCount = 0;
    const providersUsed = new Set<string>();

    for (const email of emails) {
      const details = await extractPlacementDetails(email.body, {
        preferredProvider: (user.aiProvider as any) || 'auto',
        userGeminiKey: user.geminiApiKey,
      });
      
      providersUsed.add(details._provider);

      if (details.is_placement_related === false) continue;

      let normalizedStatus = "Choose an option";
      if (details.status) {
        const titleCase = details.status.charAt(0).toUpperCase() + details.status.slice(1).toLowerCase();
        if (['Applied', 'Shortlisted', 'Interviewing', 'Rejected'].includes(titleCase)) {
          normalizedStatus = titleCase;
        }
      }

      await prisma.placementEmail.upsert({
        where: { emailId: email.id },
        update: {
          company: details.company ?? undefined,
          role: details.role ?? undefined,
          summary: details.summary
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
          summary: details.summary
        }
      });
      processedCount++;
    }

    return NextResponse.json({ 
      success: true, 
      processedCount,
      providers: Array.from(providersUsed)
    });
  } catch (error) {
    console.error("Error during sync:", error);
    return NextResponse.json({ error: "Failed to sync emails" }, { status: 500 });
  }
}
