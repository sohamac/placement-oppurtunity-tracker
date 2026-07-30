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

    const { provider, apiKey } = await req.json();
    const validProviders = ['auto', 'ollama', 'groq', 'openrouter', 'gemini'];
    
    if (provider && !validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        aiProvider: provider || 'auto',
        geminiApiKey: apiKey || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving AI preference:", error);
    return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 });
  }
}
