require('dotenv').config();
const dns = require('dns').promises;

async function testSpf() {
  const domain = 'google.com';
  try {
    const records = await dns.resolveTxt(domain);
    const txtStrings = records.map(r => r.join(''));
    const spfRecord = txtStrings.find(txt => txt.startsWith('v=spf1'));
    console.log(spfRecord);
  } catch (e) {
    console.error(e);
  }
}
testSpf();
