import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const emails = await prisma.placementEmail.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(emails);
  } catch (error) {
    console.error("Error fetching emails from DB:", error);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}
