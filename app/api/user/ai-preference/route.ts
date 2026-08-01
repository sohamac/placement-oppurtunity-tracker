import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider, geminiApiKey } = await req.json();

    const updateData: any = {
      aiProvider: provider || 'auto',
    };

    // Encrypt the key before storing (or set to null if empty)
    if (geminiApiKey && geminiApiKey.trim().length > 0) {
      updateData.geminiApiKey = encrypt(geminiApiKey.trim());
    } else if (geminiApiKey === null || geminiApiKey === '') {
      updateData.geminiApiKey = null;
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving AI preference:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save preferences' },
      { status: 500 }
    );
  }
}

// GET to return current settings (with masked key)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { aiProvider: true, geminiApiKey: true },
    });

    // Don't return the actual key — just whether one exists
    return NextResponse.json({
      aiProvider: user?.aiProvider || 'auto',
      hasGeminiKey: !!user?.geminiApiKey,
    });
  } catch (error) {
    console.error('Error fetching AI preference:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}
