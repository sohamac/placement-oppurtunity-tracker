import { google } from 'googleapis';

// ── Concurrency helper (no new dependency needed) ──
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

export async function fetchUnreadPlacementEmails(
  accessToken: string,
  existingEmailIds: string[] = []
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  console.log('Fetching unread placement emails from Gmail API...');

  try {
    const query = `newer_than:2m -category:promotions -category:social -label:newsletter (subject:interview OR subject:placement OR subject:shortlisted OR subject:application OR subject:"online test" OR subject:hiring)`;

    let allMessages: any[] = [];
    let pageToken: string | undefined = undefined;

    for (let i = 0; i < 5; i++) {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 100,
        pageToken,
      });
      if (response.data.messages) {
        allMessages = allMessages.concat(response.data.messages);
      }
      pageToken = response.data.nextPageToken as string | undefined;
      if (!pageToken) break;
    }

    if (allMessages.length === 0) return [];

    // Filter out already-synced IDs before fetching details
    const newMessages = allMessages.filter(
      (msg) => msg.id && !existingEmailIds.includes(msg.id)
    );

    console.log(`Found ${allMessages.length} emails, ${newMessages.length} new.`);

    if (newMessages.length === 0) return [];

    // ── PARALLEL FETCH: up to 5 at a time (Gmail quota safe) ──
    const emails = await mapWithConcurrency(newMessages, 5, async (msg) => {
      const msgDetails = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = msgDetails.data.payload?.headers;
      const subjectHeader = headers?.find((h: any) => h.name === 'Subject');
      const dateHeader = headers?.find((h: any) => h.name === 'Date');

      const subject = subjectHeader ? subjectHeader.value : 'No Subject';

      let receivedDate = null;
      let receivedTime = null;
      if (dateHeader?.value) {
        const d = new Date(dateHeader.value);
        receivedDate = d.toISOString().split('T')[0];
        receivedTime = d.toTimeString().split(' ')[0].substring(0, 5);
      } else if (msgDetails.data.internalDate) {
        const d = new Date(Number(msgDetails.data.internalDate));
        receivedDate = d.toISOString().split('T')[0];
        receivedTime = d.toTimeString().split(' ')[0].substring(0, 5);
      }

      // Extract body
      let body = '';
      const decodeBase64Url = (str: string) =>
        Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');

      if (msgDetails.data.payload?.parts) {
        const textPart = msgDetails.data.payload.parts.find(
          (p: any) => p.mimeType === 'text/plain'
        );
        if (textPart?.body?.data) {
          body = decodeBase64Url(textPart.body.data);
        } else {
          const htmlPart = msgDetails.data.payload.parts.find(
            (p: any) => p.mimeType === 'text/html'
          );
          if (htmlPart?.body?.data) {
            const html = decodeBase64Url(htmlPart.body.data);
            body = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          } else {
            const anyPart = msgDetails.data.payload.parts.find((p: any) => p.body?.data);
            if (anyPart) body = decodeBase64Url(anyPart.body.data);
          }
        }
      } else if (msgDetails.data.payload?.body?.data) {
        const raw = decodeBase64Url(msgDetails.data.payload.body.data);
        body =
          msgDetails.data.payload.mimeType === 'text/html'
            ? raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : raw;
      }

      if (!body || body.trim().length < 20) {
        console.warn(`Skipping email ${msg.id} — body too short`);
        return null;
      }

      return {
        id: msg.id,
        subject: subject || 'No Subject',
        body: body.substring(0, 3000),
        receivedDate,
        receivedTime,
      };
    });

    return emails.filter((e): e is NonNullable<typeof e> => e !== null);
  } catch (error) {
    console.error('Error fetching from Gmail API:', error);
    throw new Error('Failed to fetch emails from Gmail');
  }
}
