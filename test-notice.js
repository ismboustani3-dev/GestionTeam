const fetch = require('node-fetch');

async function testNotice() {
  try {
    const res = await fetch('http://localhost:3000/api/cron-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'payment_notice', teamName: 'all' })
    });
    if (res.ok) {
      console.log('Successfully triggered test payment notice!');
    } else {
      console.log('Error triggering test:', await res.text());
    }
  } catch(e) {
    console.error('Fetch error:', e);
  }
}
testNotice();
