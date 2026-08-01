import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchUnreadPlacementEmails } from '@/services/email';
import { extractPlacementDetails } from '@/services/ai';
import { decrypt } from '@/lib/crypto';

// ── Token Refresh Helper ──
async function refreshGoogleToken(account: {
  id: string;
  refresh_token: string | null;
}) {
  if (!account.refresh_token) {
    throw new Error('No refresh token available');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google token refresh failed: ${errText}`);
  }

  const tokens = await tokenRes.json();

  // Persist new token to DB
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.access_token,
      expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
      ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
    },
  });

  return tokens.access_token as string;
}

// ── Get Valid Access Token (refresh if expired) ──
export async function getValidAccessToken(account: {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}): Promise<string | null> {
  const isExpired = account.expires_at
    ? account.expires_at * 1000 < Date.now() + 60000 // 1 min buffer
    : true;

  if (!isExpired && account.access_token) {
    return account.access_token;
  }

  try {
    return await refreshGoogleToken(account);
  } catch (err) {
    console.error(`Token refresh failed for account ${account.id}:`, err);
    return null;
  }
}

// ── Cron Handler ──
export async function GET(request: Request) {
  // Protect endpoint
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    usersProcessed: 0,
    emailsFetched: 0,
    emailsAdded: 0,
    errors: [] as string[],
  };

  try {
    // Fetch all users with linked Google accounts
    const users = await prisma.user.findMany({
      include: {
        accounts: {
          where: { provider: 'google' },
        },
      },
    });

    for (const user of users) {
      const googleAccount = user.accounts[0];
      if (!googleAccount) continue;

      const accessToken = await getValidAccessToken(googleAccount);
      if (!accessToken) {
        results.errors.push(`${user.email}: token refresh failed`);
        continue;
      }

      try {
        // Get existing email IDs to avoid re-processing
        const existingEmails = await prisma.placementEmail.findMany({
          where: { userId: user.id },
          select: { emailId: true },
        });
        const existingIds = existingEmails.map((e) => e.emailId);

        // Fetch from Gmail
        const emails = await fetchUnreadPlacementEmails(accessToken, existingIds);
        results.emailsFetched += emails.length;

        // Process each email with AI
        for (const email of emails) {
          const rawGeminiKey = user.geminiApiKey ? decrypt(user.geminiApiKey) : null;
          
          const details = await extractPlacementDetails(email.body, {
            preferredProvider: (user.aiProvider as any) || 'auto',
            userGeminiKey: rawGeminiKey,
          });

          if (details.is_placement_related === false) continue;

          let normalizedStatus = 'Applied';
          if (details.status) {
            const titleCase =
              details.status.charAt(0).toUpperCase() +
              details.status.slice(1).toLowerCase();
            if (['Applied', 'Shortlisted', 'Interviewing', 'Rejected'].includes(titleCase)) {
              normalizedStatus = titleCase;
            }
          }

          await prisma.placementEmail.upsert({
            where: { emailId: email.id },
            update: {
              company: details.company ?? undefined,
              role: details.role ?? undefined,
              status: normalizedStatus,
              summary: details.summary,
            },
            create: {
              userId: user.id,
              emailId: email.id,
              subject: email.subject,
              company: details.company,
              role: details.role,
              status: normalizedStatus,
              date: email.receivedDate,
              time: email.receivedTime,
              summary: details.summary,
            },
          });

          results.emailsAdded++;
        }

        results.usersProcessed++;
      } catch (err: any) {
        const msg = `${user.email}: ${err.message}`;
        console.error(msg, err);
        results.errors.push(msg);
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Cron sync fatal error:', err);
    return NextResponse.json(
      { error: 'Cron sync failed', message: err.message },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers / GitHub Actions
export const POST = GET;
