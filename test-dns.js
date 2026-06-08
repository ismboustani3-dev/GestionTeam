const dns = require('dns').promises;

async function check() {
  try {
    const txt = await dns.resolveTxt('fkish.sbs');
    console.log('TXT:', txt);
  } catch (e) {
    console.log('TXT Error:', e.message);
  }
}
check();
