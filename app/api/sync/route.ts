import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchUnreadPlacementEmails } from '@/services/email';
import { extractPlacementDetails } from '@/services/ai';

export async function POST() {
  try {
    // 1. Fetch unread emails
    const emails = await fetchUnreadPlacementEmails();
    
    let processedCount = 0;

    // 2. Process each email
    for (const email of emails) {
      // Check if we already processed this email
      const existing = await prisma.placementEmail.findUnique({
        where: { emailId: email.id }
      });
      
      if (!existing) {
        // 3. Extract details with AI
        const details = await extractPlacementDetails(email.body);
        
        // 4. Save to Database
        await prisma.placementEmail.create({
          data: {
            emailId: email.id,
            company: details.company,
            role: details.role,
            status: details.status,
            date: details.date,
            time: details.time,
            summary: details.summary
          }
        });
        processedCount++;
      }
    }

    return NextResponse.json({ success: true, processedCount });
  } catch (error) {
    console.error("Error during sync:", error);
    return NextResponse.json({ error: "Failed to sync emails" }, { status: 500 });
  }
}
