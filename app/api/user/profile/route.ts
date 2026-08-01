import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { aiProvider: true, geminiApiKey: true, neoId: true },
    });

    return NextResponse.json({
      aiProvider: user?.aiProvider || 'auto',
      hasGeminiKey: !!user?.geminiApiKey,
      hasNeoId: !!user?.neoId,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider, geminiApiKey, neoId } = await req.json();

    const updateData: any = {};

    if (provider !== undefined) {
      updateData.aiProvider = provider || 'auto';
    }

    if (geminiApiKey !== undefined) {
      if (geminiApiKey && geminiApiKey.trim().length > 0) {
        updateData.geminiApiKey = encrypt(geminiApiKey.trim());
      } else if (geminiApiKey === null || geminiApiKey === '') {
        updateData.geminiApiKey = null;
      }
    }

    if (neoId !== undefined) {
      if (neoId && neoId.trim().length > 0) {
        updateData.neoId = encrypt(neoId.trim().toUpperCase());
      } else if (neoId === null || neoId === '') {
        updateData.neoId = null;
      }
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving profile:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save profile' },
      { status: 500 }
    );
  }
}
