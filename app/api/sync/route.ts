import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchUnreadPlacementEmails } from '@/services/email';
import { extractPlacementDetails } from '@/services/ai';
import { decrypt } from '@/lib/crypto';
import { google } from 'googleapis';
import * as XLSX from 'xlsx';

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { accounts: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const googleAccount = user.accounts.find((a) => a.provider === 'google');
    if (!googleAccount?.access_token) {
      return NextResponse.json(
        { error: 'No Google account connected' },
        { status: 400 }
      );
    }

    // Token refresh check
    let accessToken = googleAccount.access_token;
    const isExpired = googleAccount.expires_at
      ? googleAccount.expires_at * 1000 < Date.now() + 60000
      : true;

    if (isExpired) {
      if (!googleAccount.refresh_token) {
        return NextResponse.json(
          { error: 'Google session expired. Please log in again.' },
          { status: 401 }
        );
      }
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: googleAccount.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('Token refresh failed:', errText);
        return NextResponse.json(
          { error: 'Failed to refresh Google token. Please log in again.' },
          { status: 401 }
        );
      }
      const tokens = await tokenRes.json();
      accessToken = tokens.access_token;
      await prisma.account.update({
        where: { id: googleAccount.id },
        data: {
          access_token: tokens.access_token,
          expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
          ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
        },
      });
    }

    // Setup Google clients
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    const userNeoId = user.neoId ? decrypt(user.neoId) : null;

    const existingEmails = await prisma.placementEmail.findMany({
      where: {
        userId: user.id,
        NOT: [
          { summary: { contains: 'Could not extract details' } },
          { summary: { contains: 'AI Error' } },
        ],
      },
      select: { emailId: true },
    });
    const existingIds = existingEmails.map((e) => e.emailId);

    const emails = await fetchUnreadPlacementEmails(accessToken, existingIds);

    if (emails.length === 0) {
      return NextResponse.json({ success: true, processedCount: 0, providers: [] });
    }

    const providersUsed = new Set<string>();

    await mapWithConcurrency(emails, 3, async (email) => {
      let forceShortlisted = false;

      // ── NEO ID CHECK: Excel Attachments ──
      if (userNeoId && email.attachments.length > 0) {
        for (const att of email.attachments) {
          if (!att.filename.match(/\.(xlsx|xls|csv)$/i)) continue;

          try {
            const attRes = await gmail.users.messages.attachments.get({
              userId: 'me',
              messageId: email.id,
              id: att.attachmentId,
            });
            const buffer = Buffer.from(attRes.data.data as string, 'base64url');

            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            const allCells = rows
              .flat()
              .filter(Boolean)
              .map((v) => String(v).trim().toUpperCase());

            if (allCells.includes(userNeoId.toUpperCase())) {
              forceShortlisted = true;
              console.log(`[NeoID] Found ${userNeoId} in attachment ${att.filename}`);
              break;
            }
          } catch (e) {
            console.warn('Failed to parse attachment:', att.filename, e);
          }
        }
      }

      // ── NEO ID CHECK: Google Sheets ──
      if (userNeoId && !forceShortlisted && email.sheetUrls.length > 0) {
        for (const url of email.sheetUrls) {
          const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (!match) continue;
          const sheetId = match[1];

          try {
            const res = await sheets.spreadsheets.values.get({
              spreadsheetId: sheetId,
              range: 'A1:Z1000',
            });
            const values = res.data.values || [];
            const allCells = values
              .flat()
              .filter(Boolean)
              .map((v) => String(v).trim().toUpperCase());

            if (allCells.includes(userNeoId.toUpperCase())) {
              forceShortlisted = true;
              console.log(`[NeoID] Found ${userNeoId} in Google Sheet ${sheetId}`);
              break;
            }
          } catch (e) {
            console.warn('Could not read Google Sheet:', sheetId, e);
          }
        }
      }

      // ── AI Extraction ──
      const details = await extractPlacementDetails(email.body, {
        preferredProvider: (user.aiProvider as any) || 'auto',
        userGeminiKey: user.geminiApiKey ? decrypt(user.geminiApiKey) : null,
      });

      providersUsed.add((details as any)._provider || 'unknown');

      if (details.is_placement_related === false && !forceShortlisted) return;

      let normalizedStatus = 'Applied';
      if (forceShortlisted) {
        normalizedStatus = 'Shortlisted';
      } else if (details.status) {
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
          summary:
            forceShortlisted && userNeoId
              ? `Shortlisted (matched NEO ID: ${userNeoId}). ${details.summary || ''}`
              : details.summary,
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
          summary:
            forceShortlisted && userNeoId
              ? `Shortlisted (matched NEO ID: ${userNeoId}). ${details.summary || ''}`
              : details.summary,
        },
      });
    });

    return NextResponse.json({
      success: true,
      processedCount: emails.length,
      providers: Array.from(providersUsed),
    });
  } catch (error) {
    console.error('Error during sync:', error);
    return NextResponse.json({ error: 'Failed to sync emails' }, { status: 500 });
  }
}
