async function testSpf() {
  console.log('Fetching...');
  try {
    const res = await fetch('http://localhost:3000/api/cron-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'spf', teamName: 'all' })
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch(e) {
    console.error('Fetch error:', e);
  }
}
testSpf();
