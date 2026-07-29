import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { addEventToGoogleCalendar } from '@/services/calendar';

export async function POST(req: Request) {
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

    const eventDetails = await req.json();

    // Call calendar service
    const result = await addEventToGoogleCalendar(googleAccount.access_token, eventDetails);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error adding to calendar:", error);
    return NextResponse.json({ error: "Failed to add event to calendar" }, { status: 500 });
  }
}
