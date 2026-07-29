import { google } from 'googleapis';

export async function fetchUnreadPlacementEmails(accessToken: string, existingEmailIds: string[] = []) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth });

  console.log("Fetching unread placement emails from Gmail API...");

  try {
    const query = `newer_than:2m -category:promotions -category:social -label:newsletter (subject:interview OR subject:placement OR subject:shortlisted OR subject:application OR subject:"online test" OR subject:hiring)`;
    
    let allMessages: any[] = [];
    let pageToken: string | undefined = undefined;
    
    // Fetch up to 5 pages (500 emails)
    for (let i = 0; i < 5; i++) {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 100,
        pageToken: pageToken,
      });

      if (response.data.messages) {
        allMessages = allMessages.concat(response.data.messages);
      }
      
      pageToken = response.data.nextPageToken as string | undefined;
      if (!pageToken) break;
    }

    if (allMessages.length === 0) {
      return [];
    }

    const emails = [];

    for (const msg of allMessages) {
      if (!msg.id) continue;
      
      // Skip emails we already have in the database!
      if (existingEmailIds.includes(msg.id)) {
        continue;
      }

      const msgDetails = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = msgDetails.data.payload?.headers;
      const subjectHeader = headers?.find(h => h.name === 'Subject');
      const dateHeader = headers?.find(h => h.name === 'Date');
      
      const subject = subjectHeader ? subjectHeader.value : 'No Subject';
      
      // Parse received date directly from email headers
      let receivedDate = null;
      let receivedTime = null;
      if (dateHeader && dateHeader.value) {
        const d = new Date(dateHeader.value);
        receivedDate = d.toISOString().split('T')[0]; // YYYY-MM-DD
        receivedTime = d.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
      } else if (msgDetails.data.internalDate) {
        const d = new Date(Number(msgDetails.data.internalDate));
        receivedDate = d.toISOString().split('T')[0];
        receivedTime = d.toTimeString().split(' ')[0].substring(0, 5);
      }

      // Extract body
      let body = '';
      const decodeBase64Url = (str: string) => {
        return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
      };

      if (msgDetails.data.payload?.parts) {
        // Find text/plain part
        const textPart = msgDetails.data.payload.parts.find(part => part.mimeType === 'text/plain');
        if (textPart && textPart.body?.data) {
          body = decodeBase64Url(textPart.body.data);
        } else {
          // Fallback to html or other part if text/plain is missing
          const anyPart = msgDetails.data.payload.parts[0];
          if (anyPart && anyPart.body?.data) {
             body = decodeBase64Url(anyPart.body.data);
          }
        }
      } else if (msgDetails.data.payload?.body?.data) {
        body = decodeBase64Url(msgDetails.data.payload.body.data);
      }

      emails.push({
        id: msg.id,
        subject: subject || 'No Subject',
        body: body.substring(0, 3000), // Trim to avoid token limits
        receivedDate,
        receivedTime
      });
    }

    return emails;
  } catch (error) {
    console.error("Error fetching from Gmail API:", error);
    throw new Error("Failed to fetch emails from Gmail");
  }
}
