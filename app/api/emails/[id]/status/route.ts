import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status } = await req.json();
    
    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // Verify the email belongs to the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedEmail = await prisma.placementEmail.update({
      where: { 
        id: params.id,
        userId: user.id
      },
      data: { status }
    });

    return NextResponse.json({ success: true, email: updatedEmail });
  } catch (error) {
    console.error("Error updating status:", error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
