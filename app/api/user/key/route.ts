import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { apiKey } = body;

    if (typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'Invalid API Key format' }, { status: 400 });
    }

    // Update the user's geminiApiKey
    await prisma.user.update({
      where: { email: session.user.email },
      data: { geminiApiKey: apiKey || null }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving API key:", error);
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
  }
}
