import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ 
      where: { email: session.user.email },
      include: { accounts: true }
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the email in the DB first so we get the real Gmail ID
    const emailToDelete = await prisma.placementEmail.findFirst({
      where: { id: params.id, userId: user.id }
    });

    if (!emailToDelete) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Delete from database
    await prisma.placementEmail.delete({
      where: { id: params.id }
    });

    // Optionally mark as read in Gmail so it doesn't get re-synced if it's unread
    // Actually, since we removed is:unread, we should remove the 'UNREAD' label and add a 'TRASH' label?
    // Let's just remove it from the DB. If they hit sync again, the AI filter might pick it up,
    // BUT we upsert! Oh wait, if they delete it from DB, upsert will recreate it!
    // We should either mark it as read in Gmail, or keep it in the DB with a "deleted" status.
    // Let's mark it as read (remove UNREAD label) in Gmail. Since the sync route fetches newer_than:2m 
    // it fetches everything. If we don't want it re-synced, maybe we should trash it in Gmail?
    // For now, let's just delete from DB. The user can trash it in Gmail if they really want.
    // Better yet, I'll use the Google API to trash the email in Gmail! That's what a user expects when they delete an email!
    
    const googleAccount = user.accounts.find(a => a.provider === 'google');
    if (googleAccount && googleAccount.access_token) {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: googleAccount.access_token });
      const gmail = google.gmail({ version: 'v1', auth });
      
      try {
        await gmail.users.messages.trash({
          userId: 'me',
          id: emailToDelete.emailId
        });
        console.log(`Trashed email ${emailToDelete.emailId} in Gmail`);
      } catch (e) {
        console.error("Failed to trash in Gmail, might already be deleted", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting email:", error);
    return NextResponse.json({ error: 'Failed to delete email' }, { status: 500 });
  }
}
