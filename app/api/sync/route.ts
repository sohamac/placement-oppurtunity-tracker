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

    // Get user and their google account
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { accounts: true }
    });

    const googleAccount = user?.accounts.find(a => a.provider === 'google');
    if (!googleAccount || !googleAccount.access_token) {
      return NextResponse.json({ error: 'No Google account connected' }, { status: 400 });
    }

    // Fetch existing email IDs that have a SUCCESSFUL AI summary
    // Emails with an AI Error summary should be re-processed!
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

    // 1. Fetch unread emails
    const emails = await fetchUnreadPlacementEmails(googleAccount.access_token, existingIds);
    
    let processedCount = 0;

    // 2. Process each email
    for (const email of emails) {
      // 3. Extract details with AI (pass the user's geminiApiKey if they have one)
      const details = await extractPlacementDetails(email.body, user.geminiApiKey);
      
      // If AI determined it is NOT placement related, skip saving it entirely
      if (details.is_placement_related !== true) {
        console.log(`Skipping non-placement email: ${email.subject}`);
        continue;
      }

      // GUARD: Validate required fields before saving
      if (!details.summary || typeof details.summary !== 'string' || details.summary.trim().length === 0) {
        console.warn(`AI returned empty summary for: ${email.subject}`);
        continue;
      }

      // Normalize status to match frontend exactly
      let normalizedStatus = "Choose an option";
      if (details.status) {
        const titleCaseStatus = details.status.charAt(0).toUpperCase() + details.status.slice(1).toLowerCase();
        const validStatuses = ['Applied', 'Shortlisted', 'Interviewing', 'Rejected'];
        if (validStatuses.includes(titleCaseStatus)) {
          normalizedStatus = titleCaseStatus;
        }
      }

      // 4. Save to Database (upsert to overwrite if it already exists with an error)
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
          company: details.company || 'Unknown Company',
          role: details.role,
          status: normalizedStatus, // Use the normalized status
          date: email.receivedDate, // Use the real received date
          time: email.receivedTime, // Use the real received time
          summary: details.summary
        }
      });
      processedCount++;
    }

    return NextResponse.json({ success: true, processedCount });
  } catch (error) {
    console.error("Error during sync:", error);
    return NextResponse.json({ error: "Failed to sync emails" }, { status: 500 });
  }
}
