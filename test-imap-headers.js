require('dotenv').config();
const imap = require('imap-simple');
const { simpleParser } = require('mailparser');

async function test() {
  const connection = await imap.connect({
    imap: {
      user: process.env.GMAIL_USER,
      password: process.env.GMAIL_PASS,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 3000
    }
  });
  await connection.openBox('INBOX');
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const searchCriteria = [['SINCE', new Date(sevenDaysAgo)]];
  const fetchOptions = { bodies: ['HEADER', 'TEXT'], struct: true };
  const messages = await connection.search(searchCriteria, fetchOptions);
  
  if (messages.length > 0) {
    console.log(`Found ${messages.length} messages.`);
    for (const item of messages) {
      const headerPart = item.parts.find(p => p.which === 'HEADER');
      if (!headerPart || !headerPart.body || !headerPart.body.received) continue;
      
      const received = headerPart.body.received;
      const lines = Array.isArray(received) ? received : [received];
      for (const line of lines) {
        if (line.includes('151.106.61.14') || line.includes('134.119.193.242') || line.includes('67.205.121.37')) {
          console.log('--- Found IP in Received Line ---');
          console.log(line);
        }
      }
    }
  } else {
    console.log('No messages found');
  }
  
  await connection.end();
}

test().catch(console.error);
