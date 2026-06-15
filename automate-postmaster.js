const puppeteer = require('puppeteer');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCPoDZ0pSYIyUgeciVDbKkILhkUXZ8AJ4g",
  authDomain: "gestionteamnew.firebaseapp.com",
  projectId: "gestionteamnew",
  storageBucket: "gestionteamnew.firebasestorage.app",
  messagingSenderId: "682522030466",
  appId: "1:682522030466:web:c1c41cd3c024653332df9b",
  measurementId: "G-DDNN7CD4HT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function getUniqueIpDomains(ipDomains) {
  if (!ipDomains || !Array.isArray(ipDomains)) return [];
  const uniqueList = [];
  const seenIps = new Set();
  for (let i = ipDomains.length - 1; i >= 0; i--) {
    const mapping = ipDomains[i];
    if (mapping && mapping.ip) {
      const trimmedIp = mapping.ip.trim();
      if (trimmedIp && !seenIps.has(trimmedIp)) {
        seenIps.add(trimmedIp);
        uniqueList.unshift({
          ip: trimmedIp,
          domain: (mapping.domain || '').trim()
        });
      }
    }
  }
  return uniqueList;
}

async function run() {
  console.log('📦 Loading teams data from Firebase...');
  const docRef = doc(db, 'appData', 'teams');
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    console.error('❌ teams document not found in Firestore!');
    process.exit(1);
  }

  const teams = snap.data().teams || [];
  console.log(`Loaded ${teams.length} teams.`);

  // Extract all unique active domains across all teams
  const domainsToVerify = [];
  const domainToKey = {}; // Map domain to { teamIdx, serverIdx }

  teams.forEach((team, teamIdx) => {
    const servers = team.servers || [];
    servers.forEach((server, serverIdx) => {
      if (server.status === 'deleted') return;
      const uniqueIpDomains = getUniqueIpDomains(server.ipDomains);
      uniqueIpDomains.forEach(d => {
        if (!d.domain || d.domain === 'No Domain Mapped' || d.domain === 'No Domain') return;
        const saved = server.postmasterDetails?.[d.domain];
        
        // Skip if already has verification code
        if (saved && saved.googleSiteVerification) {
          return;
        }

        if (!domainToKey[d.domain]) {
          domainToKey[d.domain] = [];
        }
        domainToKey[d.domain].push({ teamIdx, serverIdx });
        if (!domainsToVerify.includes(d.domain)) {
          domainsToVerify.push(d.domain);
        }
      });
    });
  });

  if (domainsToVerify.length === 0) {
    console.log('🎉 All domains are already verified or have site verification codes saved!');
    process.exit(0);
  }

  console.log(`Need to gather TXT records for ${domainsToVerify.length} domains.`);

  console.log('🚀 Launching Chrome in headful mode using your default profile...');
  console.log('👉 IMPORTANT: If Chrome fails to open or gets stuck, please close all open Google Chrome windows first (so the script can access your active profile).');
  
  const fs = require('fs');
  let launchOptions = {
    headless: false,
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  };

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromePathX86 = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\admin_4\\.gemini\\antigravity\\scratch\\chrome_profile_copy';

  if (fs.existsSync(chromePath)) {
    launchOptions.executablePath = chromePath;
  } else if (fs.existsSync(chromePathX86)) {
    launchOptions.executablePath = chromePathX86;
  }

  if (fs.existsSync(userDataDir)) {
    launchOptions.userDataDir = userDataDir;
    console.log('Detected default Google Chrome profile directory. Loading it...');
  }

  const browser = await puppeteer.launch(launchOptions);

  const page = await browser.newPage();

  // Stealth: Mask webdriver checks
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });
  
  console.log('Navigating to Google Postmaster Tools...');
  await page.goto('https://postmaster.google.com/u/0/managedomains', { waitUntil: 'networkidle2' });

  // Wait for user login
  const fabSelector = 'div[role="button"][aria-label*="domaine"], div[role="button"][aria-label*="domain"], .z338Qb, button[aria-label*="Add"]';
  console.log('Waiting for login to complete and dashboard to load...');
  
  let loggedIn = false;
  let loopCount = 0;
  while (!loggedIn) {
    try {
      const currentUrl = page.url();
      loopCount++;
      if (loopCount % 2 === 0) {
        console.log(`[STATUS] Browser is at: ${currentUrl}. Checking for Postmaster dashboard...`);
        // Take a debug screenshot
        await page.screenshot({ path: 'C:\\Users\\admin_4\\.gemini\\antigravity\\brain\\af96ba8d-242c-42e6-b3ec-e2e646b3a2ac\\postmaster_debug.png' });
        console.log('📸 Saved debug screenshot to brain/postmaster_debug.png');
      }

      const fab = await page.$(fabSelector);
      if (fab) {
        loggedIn = true;
        break;
      }
    } catch (e) {
      console.log('Loop error:', e.message);
    }
    await new Promise(r => setTimeout(r, 2500));
  }

  console.log('🔒 Logged in detected! Starting bulk registration loop...');
  await new Promise(r => setTimeout(r, 1500));

  // Loop through domains
  for (let idx = 0; idx < domainsToVerify.length; idx++) {
    const domain = domainsToVerify[idx];
    console.log(`\n[${idx+1}/${domainsToVerify.length}] Processing domain: ${domain}...`);

    try {
      // 1. Find and click FAB '+' button
      await page.waitForSelector(fabSelector, { timeout: 10000 });
      await page.click(fabSelector);
      await new Promise(r => setTimeout(r, 1500));

      // 2. Input domain name
      const inputSelector = 'input[type="text"]';
      await page.waitForSelector(inputSelector, { timeout: 5000 });
      await page.type(inputSelector, domain);
      await new Promise(r => setTimeout(r, 800));

      // 3. Click Next (SUIVANT)
      const clickedNext = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div[role="button"], button, span'));
        const nextBtn = els.find(el => {
          const txt = el.innerText?.trim().toUpperCase() || '';
          return txt === 'SUIVANT' || txt === 'NEXT' || txt === 'CONTINUE';
        });
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (!clickedNext) {
        console.error('Could not click NEXT button!');
        continue;
      }

      await new Promise(r => setTimeout(r, 3000));

      // 4. Extract verification token
      const verificationToken = await page.evaluate(() => {
        const match = document.body.innerHTML.match(/google-site-verification=[a-zA-Z0-9_-]+/);
        return match ? match[0] : null;
      });

      if (verificationToken) {
        console.log(`✅ Found TXT record: ${verificationToken}`);

        // Update in our memory list
        const mappings = domainToKey[domain];
        mappings.forEach(({ teamIdx, serverIdx }) => {
          const server = teams[teamIdx].servers[serverIdx];
          if (!server.postmasterDetails) server.postmasterDetails = {};
          if (!server.postmasterDetails[domain]) {
            server.postmasterDetails[domain] = { status: 'Pending', reason: 'Verification pending', date: '—' };
          }
          server.postmasterDetails[domain].googleSiteVerification = verificationToken;
        });

        // Save progress to Firebase immediately
        await setDoc(docRef, { teams });
        console.log(`💾 Saved ${domain} verification token to Firestore.`);
      } else {
        console.warn(`⚠️ Warning: Could not extract verification token for ${domain}`);
      }

      // 5. Click Verify Later (PLUS TARD)
      const clickedLater = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div[role="button"], button, span'));
        let laterBtn = els.find(el => {
          const txt = el.innerText?.trim().toUpperCase() || '';
          return txt === 'PLUS TARD' || txt === 'VERIFY LATER' || txt === 'LATER' || txt === 'PLUS_TARD';
        });
        if (!laterBtn) {
          laterBtn = els.find(el => {
            const txt = el.innerText?.trim().toUpperCase() || '';
            return txt === 'RETOUR' || txt === 'BACK' || txt === 'CANCEL' || txt === 'ANNULER';
          });
        }
        if (laterBtn) {
          laterBtn.click();
          return true;
        }
        return false;
      });

      if (!clickedLater) {
        console.log('Close button not clicked automatically, attempting to escape dialog...');
        await page.keyboard.press('Escape');
      }

      await new Promise(r => setTimeout(r, 1500));

    } catch (e) {
      console.error(`Error processing domain ${domain}:`, e.message);
      // Try to close dialog just in case
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n🎉 Automation task completed successfully!');
  await page.close();
  await browser.close();
  process.exit(0);
}

run().catch(console.error);
