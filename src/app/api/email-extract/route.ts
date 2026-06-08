import { NextResponse } from 'next/server';
import imaps from 'imap-simple';

function getImapHost(email: string, provider: string): string {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  
  if (provider === 'bigpond' || domain.includes('bigpond')) {
    return 'imap.telstra.com';
  }
  
  if (domain === 'gmail.com') return 'imap.gmail.com';
  if (domain === 'yahoo.com' || domain.includes('yahoo')) return 'imap.mail.yahoo.com';
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') return 'outlook.office365.com';
  if (domain === 'aol.com') return 'imap.aol.com';
  
  return `imap.${domain}`;
}

function flattenBoxes(boxes: any, delimiter: string = '/', parentPath: string = ''): string[] {
  let list: string[] = [];
  
  for (const key of Object.keys(boxes)) {
    const box = boxes[key];
    const currentPath = parentPath ? `${parentPath}${delimiter}${key}` : key;
    
    const isNoSelect = box.attribs && box.attribs.includes('\\NOSELECT');
    if (!isNoSelect) {
      list.push(currentPath);
    }
    
    if (box.children) {
      const childDelimiter = box.delimiter || delimiter;
      const childList = flattenBoxes(box.children, childDelimiter, currentPath);
      list.push(...childList);
    }
  }
  
  return list;
}

export async function POST(request: Request) {
  let connection: any = null;
  try {
    const { 
      email, 
      password, 
      provider = 'bigpond', 
      folder = 'INBOX', 
      serverType = 'Local Server', 
      filterType = 'All', 
      filters = [], 
      extractionParam = 'Body',
      customExtractKey = '',
      action = 'execute' 
    } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password credentials.' }, { status: 400 });
    }

    const host = getImapHost(email, provider);
    const config = {
      imap: {
        user: email,
        password: password,
        host: host,
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
      }
    };

    // 1. Establish Connection
    connection = await imaps.connect(config);

    if (action === 'test') {
      const boxes = await connection.getBoxes();
      const foldersList = flattenBoxes(boxes);
      connection.end();
      return NextResponse.json({ 
        success: true, 
        message: `Successfully connected to ${host}`,
        folders: foldersList 
      });
    }

    // 2. Open Target Box
    let targetFolder = folder;
    
    // Check if the folder exists, search for case-insensitive matching
    const boxes = await connection.getBoxes();
    const boxNames = Object.keys(boxes);
    const matchedBox = boxNames.find(b => b.toLowerCase() === folder.toLowerCase());
    
    if (matchedBox) {
      targetFolder = matchedBox;
    } else {
      // Look deeper (children)
      for (const name of boxNames) {
        if (boxes[name].children) {
          const childNames = Object.keys(boxes[name].children);
          const matchedChild = childNames.find(c => c.toLowerCase() === folder.toLowerCase());
          if (matchedChild) {
            targetFolder = `${name}${boxes[name].delimiter}${matchedChild}`;
            break;
          }
        }
      }
    }

    await connection.openBox(targetFolder);

    // 3. Search Criteria
    // Scan last 14 days
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 14);
    
    const searchCriteria: any[] = [['SINCE', sinceDate]];
    if (filterType === 'Unread') {
      searchCriteria.push('UNSEEN');
    } else if (filterType === 'Read') {
      searchCriteria.push('SEEN');
    }

    const fetchOptions = {
      bodies: ['HEADER', 'TEXT'],
      struct: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    const extractedLines: string[] = [];
    const keywords = filters.map((f: string) => f.toLowerCase().trim()).filter(Boolean);

    // Sort messages to get the newest first
    const recentMessages = messages.slice(-50).reverse();

    for (const msg of recentMessages) {
      const part = msg.parts.find((p: any) => p.which === 'TEXT');
      const headerPart = msg.parts.find((p: any) => p.which === 'HEADER');
      
      const subject = headerPart?.body?.subject?.[0] || 'No Subject';
      const from = headerPart?.body?.from?.[0] || 'Unknown Sender';
      const bodyText = part?.body || '';
      const messageId = headerPart?.body?.['message-id']?.[0] || '';
      const msgDate = msg.attributes?.date ? new Date(msg.attributes.date) : null;

      if (!bodyText && filterType !== 'Subject' && filterType !== 'From') continue;

      const lines = bodyText.split(/\r?\n/);
      
      // Check if text matches keywords
      const isMatch = (text: string) => {
        if (!text) return false;
        return keywords.some((kw: string) => text.toLowerCase().includes(kw));
      };

      let filterMatched = false;

      if (keywords.length > 0) {
        if (filterType === 'Subject') {
          filterMatched = isMatch(subject);
        } else if (filterType === 'From') {
          filterMatched = isMatch(from);
        } else if (filterType === 'Message ID') {
          filterMatched = isMatch(messageId);
        } else if (filterType === 'Body') {
          filterMatched = isMatch(bodyText);
        } else if (filterType === 'All') {
          filterMatched = isMatch(subject) || isMatch(bodyText);
        } else if (filterType === 'Date' || filterType === 'Date range' || filterType === 'Range') {
          if (msgDate) {
            const dateStr = msgDate.toISOString().split('T')[0]; // YYYY-MM-DD
            filterMatched = keywords.some((kw: string) => {
              if (kw.includes('..')) {
                const [start, end] = kw.split('..');
                const startD = new Date(start);
                const endD = new Date(end);
                startD.setHours(0, 0, 0, 0);
                endD.setHours(23, 59, 59, 999);
                return msgDate >= startD && msgDate <= endD;
              }
              return dateStr.includes(kw) || kw.includes(dateStr);
            });
          }
        }
      } else {
        filterMatched = true; // No keywords = matches all
      }

      if (filterMatched) {
        let extractedValue = '';

        const getHeaderValue = (name: string): string => {
          const key = name.toLowerCase();
          if (headerPart?.body && headerPart.body[key]) {
            return headerPart.body[key][0] || '';
          }
          return '';
        };

        if (extractionParam === 'Full-source' || extractionParam === 'Full-source-2') {
          const headersStr = Object.entries(headerPart?.body || {})
            .map(([k, v]: [string, any]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\n');
          extractedValue = `--- MESSAGE START ---\n${headersStr}\n\n${bodyText}\n--- MESSAGE END ---`;
        } else if (extractionParam === 'Body') {
          if (keywords.length > 0) {
            const matchingLines = lines
              .map((l: string) => l.trim())
              .filter((l: string) => keywords.some((kw: string) => l.toLowerCase().includes(kw)));
            extractedValue = matchingLines.join('\n');
          } else {
            extractedValue = bodyText;
          }
        } else if (extractionParam === 'X-Originating-ip') {
          extractedValue = getHeaderValue('x-originating-ip') || getHeaderValue('x-real-ip') || 'No Originating IP';
        } else if (extractionParam === 'X-Sender-IP') {
          extractedValue = getHeaderValue('x-sender-ip') || 'No Sender IP';
        } else if (extractionParam === 'X-AOL-IP') {
          extractedValue = getHeaderValue('x-aol-ip') || 'No AOL IP';
        } else if (extractionParam === 'X-AOL-SPF') {
          extractedValue = getHeaderValue('x-aol-spf') || 'No AOL SPF';
        } else if (extractionParam === 'Inbox Gems') {
          const credentials = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}:[^\s]+/g) || [];
          extractedValue = credentials.join('\n') || 'No Gems Found';
        }

        // If customExtractKey is provided, filter/extract from the base value or the bodyText
        if (customExtractKey && extractedValue) {
          const searchKey = customExtractKey.toLowerCase().trim();
          const targetText = (extractionParam === 'Full-source' || extractionParam === 'Full-source-2' || extractionParam === 'Body')
            ? extractedValue 
            : `${JSON.stringify(headerPart?.body || {})}\n\n${bodyText}`;

          const targetLines = targetText.split(/\r?\n/);
          const matchedValues: string[] = [];

          for (const line of targetLines) {
            const lowerLine = line.toLowerCase();
            const keyIdx = lowerLine.indexOf(searchKey);
            if (keyIdx !== -1) {
              let val = line.substring(keyIdx + customExtractKey.length).trim();
              if (val.startsWith(':')) {
                val = val.substring(1).trim();
              }
              if (val) {
                matchedValues.push(val);
              } else {
                matchedValues.push(line.trim());
              }
            }
          }

          if (matchedValues.length === 0) {
            const headerVal = getHeaderValue(searchKey);
            if (headerVal) {
              matchedValues.push(headerVal);
            }
          }

          extractedValue = matchedValues.join('\n');
        }

        if (extractedValue) {
          extractedLines.push(`[From: ${from}] [Subj: ${subject}]\n${extractedValue}\n`);
        }
      }
    }

    connection.end();

    const outputText = extractedLines.join('\n');
    return NextResponse.json({ 
      success: true, 
      outputText,
      count: extractedLines.length 
    });

  } catch (error: any) {
    console.error('Email Extraction Error:', error);
    if (connection) {
      try { connection.end(); } catch (e) {}
    }
    return NextResponse.json({ 
      error: error.message || 'IMAP Connection Failed. Please check credentials/host settings.' 
    }, { status: 500 });
  }
}
