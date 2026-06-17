const puppeteer = require('puppeteer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
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
        uniqueList.unshift({ ip: trimmedIp, domain: (mapping.domain || '').trim() });
      }
    }
  }
  return uniqueList;
}

function getRootDomain(domain) {
  if (!domain) return '';
  const cleanDomain = domain.toLowerCase().trim();
  const parts = cleanDomain.split('.');
  if (parts.length <= 2) return cleanDomain;
  
  const len = parts.length;
  const last2 = parts[len - 2] + '.' + parts[len - 1];
  const multiPartTlds = ['co.uk', 'com.br', 'org.uk', 'net.uk', 'co.nz', 'com.au', 'com.tr', 'co.za'];
  
  if (multiPartTlds.includes(last2) && len > 2) {
    return parts[len - 3] + '.' + last2;
  }
  
  return parts[len - 2] + '.' + parts[len - 1];
}

function parseGwtDate(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr.toLowerCase().trim();
  const monthsFr = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const monthsFrShort = ['janv', 'fevr', 'mar', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];
  const monthsEn = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthsEnShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const normalized = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/,/g, ' ');
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;

  let day = null;
  let monthIndex = -1;
  let year = null;

  const yearIndex = parts.findIndex(p => p.length === 4 && /^\d+$/.test(p));
  if (yearIndex !== -1) {
    year = parseInt(parts[yearIndex], 10);
    parts.splice(yearIndex, 1);
  }

  let foundMonthIdx = -1;
  let partMonthIdx = -1;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].replace(/\./g, '');
    let idx = monthsFr.indexOf(p);
    if (idx === -1) idx = monthsFrShort.indexOf(p);
    if (idx === -1) idx = monthsEn.indexOf(p);
    if (idx === -1) idx = monthsEnShort.indexOf(p);

    if (idx !== -1) {
      foundMonthIdx = idx;
      partMonthIdx = i;
      break;
    }
  }

  if (foundMonthIdx !== -1 && partMonthIdx !== -1) {
    monthIndex = foundMonthIdx;
    parts.splice(partMonthIdx, 1);
    if (parts.length > 0) {
      day = parseInt(parts[0], 10);
    }
  }

  if (day !== null && monthIndex !== -1 && year !== null) {
    return new Date(year, monthIndex, day);
  }
  return null;
}

function mapReputationStatus(repStr) {
  if (!repStr) return { status: 'Pending', reason: 'No data' };
  const clean = repStr.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  if (clean.includes('bonne') || clean === 'high' || clean === 'good') {
    return { status: 'GOOD', reason: repStr };
  } else if (clean.includes('moyenne') || clean === 'medium') {
    return { status: 'MEDIUM', reason: repStr };
  } else if (clean.includes('plutot mauvaise') || clean === 'low') {
    return { status: 'LOW', reason: repStr };
  } else if (clean.includes('mauvaise') || clean === 'bad') {
    return { status: 'BAD', reason: repStr };
  }
  return { status: 'Pending', reason: repStr };
}

async function goBackToDomainList(page) {
  console.log('  Going back to main domains list...');
  try {
    const breadcrumbBox = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, span, div'));
      const btn = els.find(el => el.innerText?.trim() === 'Postmaster Tools');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });
    if (breadcrumbBox) {
      await page.mouse.click(breadcrumbBox.x + breadcrumbBox.width / 2, breadcrumbBox.y + breadcrumbBox.height / 2);
      await new Promise(r => setTimeout(r, 2000));
      return;
    }
  } catch (e) {
    console.log('  Breadcrumb click failed:', e.message);
  }
  
  try {
    await page.goBack();
    await new Promise(r => setTimeout(r, 2000));
    return;
  } catch (e) {
    console.log('  page.goBack failed:', e.message);
  }

  console.log('  Fallback to direct navigation...');
  await page.goto('https://postmaster.google.com/u/0/managedomains', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
}

function killExistingChromeOnPort9222() {
  return new Promise((resolve) => {
    console.log('🧹 Checking for existing processes on port 9222...');
    exec('netstat -ano | findstr :9222', (err, stdout) => {
      if (err || !stdout) {
        return resolve();
      }
      const lines = stdout.split(/\r?\n/).filter(line => line.includes('LISTENING') || line.includes('127.0.0.1:9222'));
      if (lines.length === 0) {
        return resolve();
      }
      const parts = lines[0].trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) {
        console.log(`🧹 Found zombie Chrome process (PID: ${pid}) listening on port 9222. Terminating it to release lock...`);
        exec(`taskkill /F /PID ${pid}`, () => {
          setTimeout(resolve, 1500);
        });
      } else {
        resolve();
      }
    });
  });
}

async function launchChrome() {
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  
  const profileDir = path.join(__dirname, '..', 'chrome_profile_ismadian');
  
  console.log(`🚀 Launching Chrome with profile: ${profileDir}`);
  
  // Use PowerShell Start-Process to force Chrome to open as a visible interactive window on the active desktop
  const args = [
    `--remote-debugging-port=9222`,
    `--user-data-dir=${profileDir}`,
    `--start-maximized`,
    `https://postmaster.google.com/u/0/managedomains`
  ];
  const escapedArgs = args.map(arg => `'${arg.replace(/'/g, "''")}'`).join(', ');
  const cmd = `powershell -Command "Start-Process -FilePath '${chromePath}' -ArgumentList ${escapedArgs}"`;
  
  console.log('Spawning Chrome via PowerShell Start-Process...');
  const child = exec(cmd, (err) => {
    if (err) console.log('PowerShell launch command ended:', err.message);
  });
  
  // Don't let the child process prevent Node from exiting
  child.unref();
  
  // Wait for Chrome to start
  console.log('Waiting for Chrome to start...');
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const http = require('http');
      await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json/version', (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
        }).on('error', reject);
      });
      console.log('✅ Chrome is ready!');
      return;
    } catch (e) {
      // not ready yet
    }
  }
  throw new Error('Chrome failed to start after 20 seconds');
}

// Parse arguments
const args = process.argv.slice(2);
let mode = 'all'; // 'add', 'validate', 'all'
for (const arg of args) {
  if (arg.startsWith('--mode=')) {
    mode = arg.split('=')[1];
  }
}
console.log(`Running in mode: ${mode}`);

function writeStatus(status, pid) {
  try {
    const statusPath = path.join(__dirname, 'postmaster-bot-status.json');
    const data = {
      status,
      pid,
      mode,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to write status:', e.message);
  }
}

// Clean up status on exit
process.on('exit', () => {
  try {
    const statusPath = path.join(__dirname, 'postmaster-bot-status.json');
    if (fs.existsSync(statusPath)) {
      const cur = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      if (cur.pid === process.pid) {
        fs.writeFileSync(statusPath, JSON.stringify({
          status: 'idle',
          pid: null,
          mode: null,
          updatedAt: new Date().toISOString()
        }, null, 2));
      }
    }
  } catch (e) {}
});

async function run() {
  writeStatus('running', process.pid);
  
  // Read target filter list if exists
  const filterListPath = path.join(__dirname, 'domains-filter.txt');
  let allowedDomains = null;
  if (fs.existsSync(filterListPath)) {
    allowedDomains = fs.readFileSync(filterListPath, 'utf8')
      .split(/\r?\n/)
      .map(d => d.trim().toLowerCase())
      .filter(d => d);
    console.log(`🔍 Filter active: Restricting GWT bot to ${allowedDomains.length} filtered domains.`);
  }

  console.log('📦 Loading teams data from Firebase...');
  const docRef = doc(db, 'appData', 'teams');
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    console.error('❌ teams document not found in Firestore!');
    process.exit(1);
  }

  const teams = snap.data().teams || [];
  console.log(`Loaded ${teams.length} teams.`);

  const domainsToVerify = [];
  const domainToKey = {};
  let unsavedCount = 0;

  teams.forEach((team, teamIdx) => {
    const servers = team.servers || [];
    servers.forEach((server, serverIdx) => {
      if (server.status === 'deleted') return;
      const uniqueIpDomains = getUniqueIpDomains(server.ipDomains);
      uniqueIpDomains.forEach(d => {
        if (!d.domain || d.domain === 'No Domain Mapped' || d.domain === 'No Domain') return;
        const root = getRootDomain(d.domain);

        // If a filter is active, skip any domains not in the filter
        if (allowedDomains && 
            !allowedDomains.includes(d.domain.toLowerCase().trim()) && 
            !allowedDomains.includes(root)) {
          return;
        }
        
        const saved = server.postmasterDetails?.[d.domain];
        
        // We ALWAYS map every active domain to its keys, so we can update/correct its status in Firestore
        // if we see it in GWT.
        if (!domainToKey[root]) domainToKey[root] = [];
        domainToKey[root].push({ teamIdx, serverIdx, originalDomain: d.domain });

        // domainsToVerify should contain domains that we want to check/action on.
        // In add mode, only include domains that don't have verification key in Firestore.
        // In validate/all mode, include all domains to ensure status is synced and verified.
        let includeInVerify = true;
        if (mode === 'add') {
          if (saved && saved.googleSiteVerification && saved.postmasterStatus === 'Verified') {
            includeInVerify = false;
          }
        }

        if (includeInVerify) {
          if (!domainsToVerify.includes(root)) domainsToVerify.push(root);
        }
      });
    });
  });

  if (domainsToVerify.length === 0) {
    console.log('🎉 All domains already verified!');
    process.exit(0);
  }

  console.log(`Need to process ${domainsToVerify.length} domains.\n`);

  // Always terminate any zombie processes on port 9222 first to release the profile lock and ensure a fresh window opens
  await killExistingChromeOnPort9222();

  console.log('Launching Chrome...');
  await launchChrome();
  let chromeReady = true;

  console.log('🔗 Connecting Puppeteer...');
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('postmaster'));
  if (!page) {
    page = pages[0];
  }
  console.log('Navigating to Postmaster managedomains...');
  await page.goto('https://postmaster.google.com/u/0/managedomains', { waitUntil: 'networkidle2' });

  // Wait for page to fully load
  await new Promise(r => setTimeout(r, 3000));

  // Close any open dialog
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1000));
  const dims = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  console.log(`Viewport: ${dims.width}x${dims.height}`);

  const fabX = dims.width - 55;
  const fabY = dims.height - 115;

  if (mode === 'delete') {
    console.log('\n🔒 Starting bulk deletion of target domains\n');
    
    // Read domains to delete from domains-to-delete.txt
    const deleteListPath = path.join(__dirname, 'domains-to-delete.txt');
    if (!fs.existsSync(deleteListPath)) {
      console.log('❌ No domains-to-delete.txt file found!');
      process.exit(1);
    }
    
    const domainsToDelete = fs.readFileSync(deleteListPath, 'utf8')
      .split(/\r?\n/)
      .map(d => getRootDomain(d))
      .filter(d => d && d.includes('.'));
      
    if (domainsToDelete.length === 0) {
      console.log('🎉 No domains to delete!');
      process.exit(0);
    }
    
    console.log(`Need to delete ${domainsToDelete.length} domains from GWT.`);
    
    let hasNextPage = true;
    let pageNum = 1;
    
    while (hasNextPage && domainsToDelete.length > 0) {
      console.log(`\n--- GWT Page ${pageNum} ---`);
      
      // Read rows on page
      const rowsOnPage = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[role="row"].a-f, tr'));
        return rows.map(r => {
          const cells = Array.from(r.querySelectorAll('[role="gridcell"], td'));
          if (cells.length < 2) return null;
          return cells[0].innerText?.trim().toLowerCase() || '';
        }).filter(d => d && d.includes('.'));
      });
      
      console.log(`Found ${rowsOnPage.length} domains on this page.`);
      
      for (const domain of rowsOnPage) {
        if (domainsToDelete.includes(domain)) {
          console.log(`Deleting domain: ${domain}`);
          
          try {
            // Click options menu
            const box = await page.evaluate((name) => {
              const all = Array.from(document.querySelectorAll('*'));
              const el = all.find(e => e.childNodes.length === 1 && e.innerText?.trim().toLowerCase() === name);
              if (!el) return null;
              el.scrollIntoView({ block: 'center' });
              
              let p = el.parentElement;
              while (p && p.tagName !== 'TR' && p.getAttribute('role') !== 'row' && p !== document.body) {
                p = p.parentElement;
              }
              if (p && p !== document.body) {
                const buttons = Array.from(p.querySelectorAll('button, [role="button"], [aria-label*="option"], [aria-label*="menu"]'));
                buttons.forEach(b => {
                  b.style.display = 'block';
                  b.style.opacity = '1';
                  b.style.visibility = 'visible';
                });
              }
              const rect = el.getBoundingClientRect();
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            }, domain);
            
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await new Promise(r => setTimeout(r, 1000));
            }
            
            const btnBox = await page.evaluate((name) => {
              const rows = Array.from(document.querySelectorAll('tr, [role="row"], .z338Qb, .X1Dq9b'));
              const row = rows.find(r => r.innerText && r.innerText.toLowerCase().includes(name));
              if (!row) return null;
              const buttons = Array.from(row.querySelectorAll('button, [role="button"], [aria-label*="option"], [aria-label*="menu"], [aria-haspopup="true"]'));
              const btn = buttons[buttons.length - 1];
              if (!btn) return null;
              const rect = btn.getBoundingClientRect();
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            }, domain);
            
            if (btnBox) {
              await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
            } else {
              console.log('  ❌ Menu button coordinates not found');
              continue;
            }
            
            await new Promise(r => setTimeout(r, 1500));
            
            // Click "Supprimer le domaine"
            const menuItemBox = await page.evaluate(() => {
              const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
              const deleteItem = items.find(item => {
                const text = (item.innerText || '').toUpperCase().trim();
                const rect = item.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0;
                return isVisible && (
                  text === 'SUPPRIMER LE DOMAINE' || text === 'DELETE DOMAIN' || 
                  text.includes('SUPPRIMER LE DOMAINE') || text.includes('DELETE DOMAIN') ||
                  text === 'SUPPRIMER' || text === 'DELETE'
                );
              });
              if (!deleteItem) return null;
              const rect = deleteItem.getBoundingClientRect();
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            });
            
            if (menuItemBox) {
              await page.mouse.move(menuItemBox.x + menuItemBox.width / 2, menuItemBox.y + menuItemBox.height / 2);
              await new Promise(r => setTimeout(r, 500));
              await page.mouse.click(menuItemBox.x + menuItemBox.width / 2, menuItemBox.y + menuItemBox.height / 2);
            } else {
              console.log('  ❌ Could not click "Supprimer le domaine" menu item');
              await page.keyboard.press('Escape');
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            
            // Wait for confirmation dialog
            await new Promise(r => setTimeout(r, 2000));
            
            // Click "SUPPRIMER" confirmation button
            const confirmBox = await page.evaluate(() => {
              const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              const container = dialog || document;
              const els = Array.from(container.querySelectorAll('button, [role="button"], span'));
              const btn = els.find(el => {
                const t = el.innerText?.trim().toUpperCase() || '';
                return t === 'SUPPRIMER' || t === 'DELETE' || t === 'CONFIRMER' || t === 'CONFIRM' || t === 'OK';
              });
              if (!btn) return null;
              const rect = btn.getBoundingClientRect();
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            });
            
            if (confirmBox) {
              console.log('  Clicking confirmation SUPPRIMER button...');
              await page.mouse.move(confirmBox.x + confirmBox.width / 2, confirmBox.y + confirmBox.height / 2);
              await new Promise(r => setTimeout(r, 500));
              await page.mouse.click(confirmBox.x + confirmBox.width / 2, confirmBox.y + confirmBox.height / 2);
              await new Promise(r => setTimeout(r, 3000));
            } else {
              console.log('  ⚠️ No confirmation SUPPRIMER button found, closing...');
              await page.keyboard.press('Escape');
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            
            console.log(`  ✅ Successfully deleted ${domain} from GWT`);
            
            // Update Firestore memory
            const targetDomainKey = Object.keys(domainToKey).find(k => k.toLowerCase().trim() === domain);
            const mappings = targetDomainKey ? domainToKey[targetDomainKey] : null;
            if (mappings) {
              mappings.forEach(({ teamIdx, serverIdx }) => {
                const server = teams[teamIdx].servers[serverIdx];
                if (server.postmasterDetails?.[targetDomainKey]) {
                  server.postmasterDetails[targetDomainKey].postmasterStatus = 'Not Verified';
                  delete server.postmasterDetails[targetDomainKey].googleSiteVerification;
                }
              });
              unsavedCount++;
            }
            
            // Remove from list of domains to delete
            const idxToDelete = domainsToDelete.indexOf(domain);
            if (idxToDelete !== -1) domainsToDelete.splice(idxToDelete, 1);
            
          } catch (e) {
            console.log(`  ❌ Error deleting domain: ${e.message}`);
            await page.keyboard.press('Escape');
            await new Promise(r => setTimeout(r, 1500));
          }
        }
      }
      
      if (domainsToDelete.length === 0) break;
      
      // Click next page
      const clickedNext = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const btn = buttons.find(b => {
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          const isNext = label.includes('next') || label.includes('suivante') || label.includes('suivant');
          if (!isNext) return false;
          const isDisabled = b.getAttribute('aria-disabled') === 'true' || b.disabled || b.className.includes('disabled');
          return !isDisabled && b.getBoundingClientRect().width > 0;
        });
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      
      if (clickedNext) {
        console.log('Clicked next page button, waiting for new page data...');
        pageNum++;
        await new Promise(r => setTimeout(r, 3000));
      } else {
        hasNextPage = false;
      }
    }
    
    // Save Firestore
    if (unsavedCount > 0) {
      await setDoc(docRef, { teams });
    }
    
    console.log('\n🎉 Finished bulk deletion!');
    browser.disconnect();
    process.exit(0);
  }

  console.log('\n🔒 Starting bulk: Page through GWT → Sync & Validate → Add missing\n');

  const seenInGWT = new Set();
  const results = [];
  const errors = [];
  let consecutiveErrors = 0;
  unsavedCount = 0;

  // Drive processing by paging through GWT first
  let hasNextPage = true;
  let pageNum = 1;

  while (hasNextPage) {
    console.log(`\n--- GWT Page ${pageNum} ---`);
    
    // 1. Read rows on the current page
    const rowsOnPage = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"].a-f, tr'));
      return rows.map(r => {
        const cells = Array.from(r.querySelectorAll('[role="gridcell"], td'));
        if (cells.length < 2) return null;
        const domain = cells[0].innerText?.trim() || '';
        const statusText = cells[1].innerText?.trim() || '';
        
        let status = 'Unknown';
        const cleanText = (statusText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (cleanText.includes('not verified') || cleanText.includes('non valide') || cleanText.includes('non verifie')) {
          status = 'Not Verified';
        } else if (cleanText.includes('verified') || cleanText.includes('valide') || cleanText.includes('verifie')) {
          status = 'Verified';
        }
        return { domain, status };
      }).filter(r => r && r.domain && r.domain.includes('.'));
    });

    console.log(`Found ${rowsOnPage.length} domains on this page.`);

    for (let rIdx = 0; rIdx < rowsOnPage.length; rIdx++) {
      const { domain, status } = rowsOnPage[rIdx];
      seenInGWT.add(domain.toLowerCase().trim());

      // Check if this domain is one of our target domains from Firestore (case-insensitive)
      const targetDomainKey = Object.keys(domainToKey).find(k => k.toLowerCase().trim() === domain.toLowerCase().trim());
      const mappings = targetDomainKey ? domainToKey[targetDomainKey] : null;
      if (!mappings) {
        // Not a domain we care about in Firestore
        continue;
      }

      console.log(`[Page ${pageNum} - ${rIdx + 1}/${rowsOnPage.length}] ${targetDomainKey} (GWT Status: ${status})`);

      // Update Firestore with GWT status (only if it has actually changed)
      let statusChanged = false;
      mappings.forEach(({ teamIdx, serverIdx, originalDomain }) => {
        const server = teams[teamIdx].servers[serverIdx];
        if (!server.postmasterDetails) server.postmasterDetails = {};
        if (!server.postmasterDetails[originalDomain]) {
          server.postmasterDetails[originalDomain] = { status: 'Pending', reason: 'Verification pending', date: '—' };
          statusChanged = true;
        }
        if (server.postmasterDetails[originalDomain].postmasterStatus !== status) {
          server.postmasterDetails[originalDomain].postmasterStatus = status;
          statusChanged = true;
        }
      });
      if (statusChanged) {
        unsavedCount++;
      }

      // If it is unverified, and we are in validate/fetch/all mode, run validation/fetch
      if (status === 'Not Verified' && (mode === 'validate' || mode === 'fetch' || mode === 'all')) {
        try {
          console.log(`  Running ${mode === 'fetch' ? 'fetch key' : 'validation'} click flow for ${targetDomainKey}...`);

          // Hover text element using coordinates to avoid Puppeteer connect hanging on hover()
          const box = await page.evaluate((name) => {
            const all = Array.from(document.querySelectorAll('*'));
            const el = all.find(e => e.childNodes.length === 1 && e.innerText?.trim() === name);
            if (!el) return null;
            
            el.scrollIntoView({ block: 'center' });
            
            // Force show button in its row
            let p = el.parentElement;
            while (p && p.tagName !== 'TR' && p.getAttribute('role') !== 'row' && p !== document.body) {
              p = p.parentElement;
            }
            if (p && p !== document.body) {
              const buttons = Array.from(p.querySelectorAll('button, [role="button"], [aria-label*="option"], [aria-label*="menu"]'));
              buttons.forEach(b => {
                b.style.display = 'block';
                b.style.opacity = '1';
                b.style.visibility = 'visible';
              });
            }

            const rect = el.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          }, targetDomainKey);

          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await new Promise(r => setTimeout(r, 1000));
          }

          // Find three dots button bounding box
          const btnBox = await page.evaluate((name) => {
            const rows = Array.from(document.querySelectorAll('tr, [role="row"], .z338Qb, .X1Dq9b'));
            const row = rows.find(r => r.innerText && r.innerText.includes(name));
            if (!row) return null;
            const buttons = Array.from(row.querySelectorAll('button, [role="button"], [aria-label*="option"], [aria-label*="menu"], [aria-haspopup="true"]'));
            const btn = buttons[buttons.length - 1];
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          }, targetDomainKey);

          if (btnBox) {
            await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
          } else {
            console.log('  ❌ Three-dots menu button bounding box not found');
            errors.push({ domain: targetDomainKey, error: 'Three-dots menu button not found', status: 'ERROR' });
            continue;
          }

          // Wait for menu dropdown
          await new Promise(r => setTimeout(r, 1500));

          // Click "Valider le domaine"
          let menuItemBox = null;
          for (let attempt = 0; attempt < 10; attempt++) {
            menuItemBox = await page.evaluate(() => {
              const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
              const validateItem = items.find(item => {
                const text = (item.innerText || '').toUpperCase().trim();
                const hasText = text.includes('VALIDER') || text.includes('VERIFY') || text.includes('VALIDATE');
                if (!hasText) return false;
                const rect = item.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              if (!validateItem) return null;
              const rect = validateItem.getBoundingClientRect();
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            });
            if (menuItemBox) break;
            await new Promise(r => setTimeout(r, 500));
          }

          if (menuItemBox) {
            await page.mouse.move(menuItemBox.x + menuItemBox.width / 2, menuItemBox.y + menuItemBox.height / 2);
            await new Promise(r => setTimeout(r, 500));
            await page.mouse.click(menuItemBox.x + menuItemBox.width / 2, menuItemBox.y + menuItemBox.height / 2);
          } else {
            console.log('  ❌ Could not click "Valider le domaine" menu item');
            await page.keyboard.press('Escape');
            await new Promise(r => setTimeout(r, 1000));
            errors.push({ domain: targetDomainKey, error: 'Valider menu item not found', status: 'ERROR' });
            continue;
          }

          // Wait for validation dialog
          await new Promise(r => setTimeout(r, 2000));

          // Extract token from dialog first (with retry loop for loading spinner)
          let extractedToken = null;
          for (let attempt = 0; attempt < 15; attempt++) {
            extractedToken = await page.evaluate(() => {
              const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              const container = dialog || document.body;
              const elements = Array.from(container.querySelectorAll('*'));
              elements.push(container);
              
              const candidates = [];
              for (const el of elements) {
                if (el.value && el.value.includes('google-site-verification=')) {
                  candidates.push(el.value);
                }
                if (el.textContent && el.textContent.includes('google-site-verification=')) {
                  candidates.push(el.textContent);
                }
              }
              
              candidates.sort((a, b) => a.length - b.length);
              
              for (const text of candidates) {
                const match = text.match(/google-site-verification=([a-zA-Z0-9_-]+)/);
                if (match) {
                  return match[0];
                }
              }
              return null;
            });
            if (extractedToken) break;
            await new Promise(r => setTimeout(r, 500));
          }

          if (extractedToken) {
            console.log(`  📋 Extracted Token: ${extractedToken}`);
            // Update GWT verification key in memory
            mappings.forEach(({ teamIdx, serverIdx, originalDomain }) => {
              teams[teamIdx].servers[serverIdx].postmasterDetails[originalDomain].googleSiteVerification = extractedToken;
            });
            unsavedCount++;
          } else {
            console.log('  ⚠️ No TXT token found in validation dialog');
          }

          // Click "VALIDER" button
          const validerBox = await page.evaluate(() => {
            const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            const container = dialog || document.body;
            const els = Array.from(container.querySelectorAll('div[role="button"], button, span'));
            const btn = els.find(el => {
              const t = el.innerText?.trim().toUpperCase() || '';
              return t === 'VALIDER' || t === 'VERIFY' || t === 'VALIDATE';
            });
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          });

          let valResult = { result: 'NOT OK', reason: 'VALIDER button not found in dialog' };
          if (validerBox) {
            console.log('  Clicking VALIDER button...');
            await page.mouse.move(validerBox.x + validerBox.width / 2, validerBox.y + validerBox.height / 2);
            await new Promise(r => setTimeout(r, 500));
            await page.mouse.click(validerBox.x + validerBox.width / 2, validerBox.y + validerBox.height / 2);
            console.log('  ⏳ Verifying...');
            await new Promise(r => setTimeout(r, 5000));

            // Check result and extract error reason if any
            valResult = await page.evaluate(() => {
              const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              if (!dialog) return { result: 'OK', reason: 'Verification succeeded' };
              
              const text = dialog.innerText || '';
              const cleanText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              
              const hasError = cleanText.includes('impossible de trouver') || 
                                cleanText.includes('introuvable') || 
                                cleanText.includes('patientez quelques minutes') || 
                                cleanText.includes('reessayer') ||
                                cleanText.includes('echec') ||
                                cleanText.includes('failed') ||
                                cleanText.includes('erreur') ||
                                cleanText.includes('not found');
                                
              const hasSuccess = cleanText.includes('a ete verifie') || 
                                 cleanText.includes('succes') || 
                                 cleanText.includes('verified') || 
                                 cleanText.includes('success') ||
                                 cleanText.includes('valide');
                                 
              if (hasError) {
                const els = Array.from(dialog.querySelectorAll('div, p, span'));
                const errorCandidates = [];
                for (const el of els) {
                  const t = el.innerText?.trim() || '';
                  if (t.length > 20 && t.length < 500) {
                    const ct = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (ct.includes('impossible') || ct.includes('introuvable') || ct.includes('patientez') || ct.includes('failed') || ct.includes('not found') || ct.includes('erreur')) {
                      errorCandidates.push(t);
                    }
                  }
                }
                errorCandidates.sort((a, b) => a.length - b.length);
                const reason = errorCandidates.length > 0 ? errorCandidates[0] : 'Verification failed: DNS TXT record not found';
                return { result: 'NOT OK', reason };
              }
              
              if (hasSuccess) {
                return { result: 'OK', reason: 'Verification succeeded' };
              }
              
              return { result: 'NOT OK', reason: 'Unknown verification state' };
            });
          } else {
            console.log('  ⚠️ No VALIDER button in dialog');
          }

          console.log(`  ${valResult.result === 'OK' ? '✅' : '❌'} Validation: ${valResult.result}`);
          if (valResult.result === 'NOT OK') {
            console.log(`  📝 Error reason: ${valResult.reason}`);
          }
          
          results.push({ 
            domain: targetDomainKey, 
            verificationToken: extractedToken || 'N/A', 
            validationStatus: valResult.result 
          });

          // Update Firestore with new status and extracted error reason
          mappings.forEach(({ teamIdx, serverIdx, originalDomain }) => {
            const detail = teams[teamIdx].servers[serverIdx].postmasterDetails[originalDomain];
            detail.postmasterStatus = valResult.result === 'OK' ? 'Verified' : 'Not Verified';
            detail.reason = valResult.reason;
            detail.date = new Date().toLocaleDateString('fr-FR');
          });
          unsavedCount++;

          // Close dialog
            const closeBox = await page.evaluate(() => {
              const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              const container = dialog || document.body;
              const els = Array.from(container.querySelectorAll('div[role="button"], button, span'));
              const btn = els.find(el => {
                const t = el.innerText?.trim().toUpperCase() || '';
                return t === 'OK' || t === 'FERMER' || t === 'CLOSE' || t === 'TERMINER' || t === 'DONE' || 
                       t === 'PLUS TARD' || t === 'RETOUR' || t === 'BACK' || t === 'ANNULER';
              });
              if (!btn) return null;
              const rect = btn.getBoundingClientRect();
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            });

            if (closeBox) {
              await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
              await new Promise(r => setTimeout(r, 500));
              await page.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
            } else {
              await page.keyboard.press('Escape');
            }
            await new Promise(r => setTimeout(r, 1500));

          // Double check closed
          const stillOpen = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
            return Array.from(inputs).some(i => i.offsetParent !== null);
          });
          if (stillOpen) {
            await page.keyboard.press('Escape');
            await new Promise(r => setTimeout(r, 1500));
          }

          consecutiveErrors = 0;
        } catch (e) {
          console.log(`  ❌ Error during validation flow: ${e.message}`);
          errors.push({ domain: targetDomainKey, error: e.message, status: 'ERROR' });
          consecutiveErrors++;
          await page.keyboard.press('Escape');
          await new Promise(r => setTimeout(r, 2000));
          if (consecutiveErrors > 5) {
            console.log('Too many consecutive errors, stopping GWT page loop.');
            hasNextPage = false;
            break;
          }
        }
      } else if (status === 'Verified' && (mode === 'sync' || mode === 'validate' || mode === 'all')) {
        try {
          const targetUrl = `https://postmaster.google.com/u/0/dashboards#do=${targetDomainKey}&st=domainReputation&dr=7`;
          console.log(`  Domain is verified. Direct navigating to: ${targetUrl}`);
          
          await page.goto(targetUrl, { waitUntil: 'networkidle2' });
          await new Promise(r => setTimeout(r, 4000)); // wait for client-side routing & data load

          // Check if there is "No data to display" on the page
          const noDataMsg = await page.evaluate(() => {
            const bodyText = document.body.innerText || '';
            const cleanText = bodyText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            
            const hasNoDataText = cleanText.includes('aucune donnee a afficher') || 
                                  cleanText.includes('no data to display') || 
                                  cleanText.includes('veuillez importer des donnees') || 
                                  cleanText.includes('please upload data') ||
                                  cleanText.includes('no result');
            if (hasNoDataText) {
              const candidates = ['aucune donnée à afficher pour le moment', 'no data to display at this time', 'aucune donnée à afficher', 'no data to display'];
              const match = candidates.find(c => cleanText.includes(c));
              return match ? match : 'No data to display';
            }
            return null;
          });

          let reputationResult = { status: 'Pending', reason: 'No data available' };

          if (noDataMsg) {
            console.log(`  ℹ️ No data available message detected: "${noDataMsg}"`);
            reputationResult = { status: 'Pending', reason: noDataMsg };
          } else {
            // Extract table data
            const tableData = await page.evaluate(() => {
              const rows = Array.from(document.querySelectorAll('tr, [role="row"]'));
              const extracted = [];
              for (const row of rows) {
                const cells = Array.from(row.querySelectorAll('td, [role="gridcell"]'));
                if (cells.length >= 2) {
                  const dateText = cells[0].innerText?.trim();
                  const repText = cells[1].innerText?.trim();
                  if (dateText && repText) {
                    extracted.push({ dateText, repText });
                  }
                }
              }
              return extracted;
            });

            // Parse dates and find the most recent row
            const validRows = [];
            for (const row of tableData) {
              const dText = row.dateText.toLowerCase();
              if (dText.includes('date') || dText.includes('reputation') || dText.includes('taux')) {
                continue;
              }
              const parsedDate = parseGwtDate(row.dateText);
              if (parsedDate) {
                validRows.push({ date: parsedDate, dateText: row.dateText, value: row.repText });
              }
            }

            if (validRows.length > 0) {
              validRows.sort((a, b) => b.date - a.date);
              const mostRecent = validRows[0];
              reputationResult = mapReputationStatus(mostRecent.value);
              console.log(`  Parsed most recent reputation: ${mostRecent.value} on ${mostRecent.dateText}`);
            } else {
              console.log('  ⚠️ No reputation data rows found in table');
            }
          }

          // Update Firestore memory
          mappings.forEach(({ teamIdx, serverIdx, originalDomain }) => {
            const detail = teams[teamIdx].servers[serverIdx].postmasterDetails[originalDomain];
            detail.status = reputationResult.status;
            detail.reason = reputationResult.reason;
            detail.date = new Date().toLocaleDateString('fr-FR');
          });
          unsavedCount++;

          // Go back to main domains list for next iteration
          await page.goto('https://postmaster.google.com/u/0/managedomains', { waitUntil: 'networkidle2' });
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.log(`  ❌ Error during reputation collection: ${e.message}`);
          await page.goto('https://postmaster.google.com/u/0/managedomains', { waitUntil: 'networkidle2' });
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (unsavedCount >= 20) {
        await setDoc(docRef, { teams });
        console.log(`  💾 Batch saved to Firebase (${results.length} total)`);
        unsavedCount = 0;
      }
    }

    if (!hasNextPage) break;

    // Try clicking Next page
    const clickedNext = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = buttons.find(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const isNext = label.includes('next') || label.includes('suivante') || label.includes('suivant');
        if (!isNext) return false;
        const isDisabled = b.getAttribute('aria-disabled') === 'true' || b.disabled || b.className.includes('disabled');
        return !isDisabled && b.getBoundingClientRect().width > 0;
      });
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (clickedNext) {
      console.log('Clicked next page button, waiting for new page data...');
      pageNum++;
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log('No next page button or next page is disabled. Ending GWT page loop.');
      hasNextPage = false;
    }
  }

  // Save intermediate state
  if (unsavedCount > 0) {
    await setDoc(docRef, { teams });
    unsavedCount = 0;
  }

  // Now, handle domains in Firestore that were NOT seen on any GWT page
  const missingDomains = domainsToVerify.filter(d => !seenInGWT.has(d.toLowerCase().trim()));
  
  if (missingDomains.length > 0 && (mode === 'add' || mode === 'all')) {
    console.log(`\n--- Adding ${missingDomains.length} missing domains to GWT ---`);
    for (let mIdx = 0; mIdx < missingDomains.length; mIdx++) {
      const domain = missingDomains[mIdx];
      console.log(`[Missing ${mIdx + 1}/${missingDomains.length}] ${domain}`);
      
      try {
        // Run ADD flow for this domain
        // STEP 1: Click FAB '+'
        await page.mouse.click(fabX, fabY);
        await new Promise(r => setTimeout(r, 1500));

        // STEP 2: Input domain
        const inputSelector = 'input[type="text"], input:not([type])';
        try {
          await page.waitForSelector(inputSelector, { timeout: 5000 });
        } catch (e) {
          // Retry FAB click
          await page.mouse.click(fabX, fabY);
          await new Promise(r => setTimeout(r, 2000));
          await page.waitForSelector(inputSelector, { timeout: 5000 });
        }

        await page.click(inputSelector);
        await page.evaluate(sel => { const i = document.querySelector(sel); if (i) i.value = ''; }, inputSelector);
        await page.type(inputSelector, domain, { delay: 30 });
        await new Promise(r => setTimeout(r, 500));

        // STEP 3: Click NEXT
        const clickedNext = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('div[role="button"], button, span'));
          const btn = els.find(el => {
            const t = el.innerText?.trim().toUpperCase() || '';
            return t === 'SUIVANT' || t === 'NEXT' || t === 'CONTINUE';
          });
          if (btn) { btn.click(); return true; }
          return false;
        });

        if (!clickedNext) {
          console.log('  ❌ No NEXT button');
          await page.keyboard.press('Escape');
          await new Promise(r => setTimeout(r, 1000));
          errors.push({ domain, error: 'No NEXT button', status: 'ERROR' });
          continue;
        }

        await new Promise(r => setTimeout(r, 3000));

        // STEP 4: Check if domain is already validated (3/3 - Fin screen)
        const alreadyVerified = await page.evaluate(() => {
          const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (!dialog) return false;
          const text = (dialog.innerText || '').toUpperCase();
          return text.includes('3/3') || 
                 text.includes('AJOUTÉ À VOS DOMAINES') || 
                 text.includes('ADDED TO YOUR VALIDATED DOMAINS') ||
                 text.includes('AJOUTER UN DOMAINE');
        });

        // Initialize Firestore memory list
        const mappings = domainToKey[domain];
        mappings.forEach(({ teamIdx, serverIdx }) => {
          const server = teams[teamIdx].servers[serverIdx];
          if (!server.postmasterDetails) server.postmasterDetails = {};
          if (!server.postmasterDetails[domain]) {
            server.postmasterDetails[domain] = { status: 'Pending', reason: 'Verification pending', date: '—' };
          }
        });

        let validationStatus = 'NOT OK';
        let token = null;
        let extractedReason = alreadyVerified ? 'Verification succeeded' : 'Verification pending';

        if (alreadyVerified) {
          console.log('  Domain is already verified (3/3 - Fin screen detected).');
          validationStatus = 'OK';

          // Click OK to close dialog
          const closeBox = await page.evaluate(() => {
            const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            const container = dialog || document.body;
            const els = Array.from(container.querySelectorAll('div[role="button"], button, span'));
            const btn = els.find(el => {
              const t = el.innerText?.trim().toUpperCase() || '';
              return t === 'OK' || t === 'FERMER' || t === 'CLOSE' || t === 'TERMINER' || t === 'DONE';
            });
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          });

          if (closeBox) {
            console.log('  Clicking OK button to close dialog...');
            await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
            await new Promise(r => setTimeout(r, 500));
            await page.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
          } else {
            console.log('  ⚠️ Could not find OK button, pressing Escape...');
            await page.keyboard.press('Escape');
          }
          await new Promise(r => setTimeout(r, 1500));
        } else {
          // Extract token from dialog first (with retry loop for loading spinner)
          token = null;
          for (let attempt = 0; attempt < 15; attempt++) {
            token = await page.evaluate(() => {
              const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              const container = dialog || document.body;
              const elements = Array.from(container.querySelectorAll('*'));
              elements.push(container);
              
              const candidates = [];
              for (const el of elements) {
                if (el.value && el.value.includes('google-site-verification=')) {
                  candidates.push(el.value);
                }
                if (el.textContent && el.textContent.includes('google-site-verification=')) {
                  candidates.push(el.textContent);
                }
              }
              
              candidates.sort((a, b) => a.length - b.length);
              
              for (const text of candidates) {
                const match = text.match(/google-site-verification=([a-zA-Z0-9_-]+)/);
                if (match) {
                  return match[0];
                }
              }
              return null;
            });
            if (token) break;
            await new Promise(r => setTimeout(r, 500));
          }

          if (token) {
            console.log(`  📋 Token: ${token}`);
          } else {
            console.log('  ⚠️ No TXT token found');
          }

          // Update GWT verification key in memory
          mappings.forEach(({ teamIdx, serverIdx, originalDomain }) => {
            const server = teams[teamIdx].servers[serverIdx];
            if (token) server.postmasterDetails[originalDomain].googleSiteVerification = token;
          });

          // STEP 5: Click VALIDER
          const validerBox = await page.evaluate(() => {
            const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            const container = dialog || document.body;
            const els = Array.from(container.querySelectorAll('div[role="button"], button, span'));
            const btn = els.find(el => {
              const t = el.innerText?.trim().toUpperCase() || '';
              return t === 'VALIDER' || t === 'VERIFY' || t === 'VALIDATE';
            });
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          });

          if (validerBox) {
            console.log('  Clicking VALIDER button...');
            await page.mouse.move(validerBox.x + validerBox.width / 2, validerBox.y + validerBox.height / 2);
            await new Promise(r => setTimeout(r, 500));
            await page.mouse.click(validerBox.x + validerBox.width / 2, validerBox.y + validerBox.height / 2);
            await new Promise(r => setTimeout(r, 5000));

            // Check result and extract error reason if any
            const valResult = await page.evaluate(() => {
              const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              if (!dialog) return { result: 'OK', reason: 'Verification succeeded' };
              
              const text = dialog.innerText || '';
              const cleanText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              
              const hasError = cleanText.includes('impossible de trouver') || 
                                cleanText.includes('introuvable') || 
                                cleanText.includes('patientez quelques minutes') || 
                                cleanText.includes('reessayer') ||
                                cleanText.includes('echec') ||
                                cleanText.includes('failed') ||
                                cleanText.includes('erreur') ||
                                cleanText.includes('not found');
                                
              const hasSuccess = cleanText.includes('a ete verifie') || 
                                 cleanText.includes('succes') || 
                                 cleanText.includes('verified') || 
                                 cleanText.includes('success') ||
                                 cleanText.includes('valide');
                                 
              if (hasError) {
                const els = Array.from(dialog.querySelectorAll('div, p, span'));
                const errorCandidates = [];
                for (const el of els) {
                  const t = el.innerText?.trim() || '';
                  if (t.length > 20 && t.length < 500) {
                    const ct = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (ct.includes('impossible') || ct.includes('introuvable') || ct.includes('patientez') || ct.includes('failed') || ct.includes('not found') || ct.includes('erreur')) {
                      errorCandidates.push(t);
                    }
                  }
                }
                errorCandidates.sort((a, b) => a.length - b.length);
                const reason = errorCandidates.length > 0 ? errorCandidates[0] : 'Verification failed: DNS TXT record not found';
                return { result: 'NOT OK', reason };
              }
              
              if (hasSuccess) {
                return { result: 'OK', reason: 'Verification succeeded' };
              }
              
              return { result: 'NOT OK', reason: 'Unknown verification state' };
            });

            validationStatus = valResult.result;
            extractedReason = valResult.reason;
            console.log(`  ${valResult.result === 'OK' ? '✅' : '❌'} Validation: ${valResult.result}`);
            if (valResult.result === 'NOT OK') {
              console.log(`  📝 Error reason: ${valResult.reason}`);
            }

            // Close dialog
            const closeBox = await page.evaluate(() => {
              const dialog = Array.from(document.querySelectorAll('[role="dialog"], .tk3N6e-McfNlf, .b-c')).find(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              const container = dialog || document.body;
              const els = Array.from(container.querySelectorAll('div[role="button"], button, span'));
              const btn = els.find(el => {
                const t = el.innerText?.trim().toUpperCase() || '';
                return t === 'OK' || t === 'FERMER' || t === 'CLOSE' || t === 'TERMINER' || t === 'DONE' || 
                       t === 'PLUS TARD' || t === 'RETOUR' || t === 'BACK' || t === 'ANNULER';
              });
              if (!btn) return null;
              const rect = btn.getBoundingClientRect();
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            });

            if (closeBox) {
              await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
              await new Promise(r => setTimeout(r, 500));
              await page.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
            } else {
              await page.keyboard.press('Escape');
            }
          } else {
            // If no valider button, click "PLUS TARD"
            await page.evaluate(() => {
              const els = Array.from(document.querySelectorAll('div[role="button"], button, span'));
              const btn = els.find(el => {
                const t = el.innerText?.trim().toUpperCase() || '';
                return t === 'PLUS TARD' || t === 'VERIFY LATER' || t === 'LATER';
              });
              if (btn) btn.click();
            });
          }
          await new Promise(r => setTimeout(r, 1500));
        }

        // Double check closed
        const stillOpen = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
          return Array.from(inputs).some(i => i.offsetParent !== null);
        });
        if (stillOpen) {
          await page.keyboard.press('Escape');
          await new Promise(r => setTimeout(r, 1500));
        }

        mappings.forEach(({ teamIdx, serverIdx, originalDomain }) => {
          const detail = teams[teamIdx].servers[serverIdx].postmasterDetails[originalDomain];
          detail.postmasterStatus = validationStatus === 'OK' ? 'Verified' : 'Not Verified';
          detail.reason = extractedReason;
          detail.date = new Date().toLocaleDateString('fr-FR');
        });

        results.push({ domain, verificationToken: token || 'N/A', validationStatus });
        unsavedCount++;

        if (unsavedCount >= 20) {
          await setDoc(docRef, { teams });
          console.log(`  💾 Batch saved to Firebase (${results.length} total)`);
          unsavedCount = 0;
        }

        consecutiveErrors = 0;
      } catch (e) {
        console.log(`  ❌ Error adding domain: ${e.message}`);
        errors.push({ domain, error: e.message, status: 'ERROR' });
        consecutiveErrors++;
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 2000));
        if (consecutiveErrors > 5) {
          console.log('Too many errors, stopping addition loop.');
          break;
        }
      }
    }
  } else if (missingDomains.length > 0 && (mode === 'validate' || mode === 'sync' || mode === 'fetch')) {
    console.log(`\n⚠️ Note: ${missingDomains.length} domains are missing from GWT. Setting Firestore status to Not Verified.`);
    missingDomains.forEach(domain => {
      const targetDomainKey = Object.keys(domainToKey).find(k => k.toLowerCase().trim() === domain.toLowerCase().trim());
      const mappings = targetDomainKey ? domainToKey[targetDomainKey] : null;
      if (mappings) {
        mappings.forEach(({ teamIdx, serverIdx }) => {
          const server = teams[teamIdx].servers[serverIdx];
          if (!server.postmasterDetails) server.postmasterDetails = {};
          if (!server.postmasterDetails[targetDomainKey]) {
            server.postmasterDetails[targetDomainKey] = { status: 'Pending', reason: 'Verification pending', date: '—' };
          }
          server.postmasterDetails[targetDomainKey].postmasterStatus = 'Not Verified';
        });
        unsavedCount++;
      }
    });
  }

  // Final save
  if (unsavedCount > 0) {
    await setDoc(docRef, { teams });
    console.log(`\n💾 Final save (${results.length} total)`);
  }

  // Save TXT records file
  const outputPath = path.join(__dirname, 'google_postmaster_import.txt');
  const txtContent = results.filter(r => r.verificationToken !== 'N/A')
    .map(r => `${r.domain},${r.domain},TXT,${r.verificationToken}`).join('\n');
  fs.writeFileSync(outputPath, txtContent);
  console.log(`\n💾 TXT records: ${outputPath}`);

  // Save validation summary
  const summaryPath = path.join(__dirname, 'validation_results.txt');
  fs.writeFileSync(summaryPath, results.map(r => `${r.domain} | ${r.verificationToken} | ${r.validationStatus}`).join('\n'));
  console.log(`📊 Summary: ${summaryPath}`);

  const ok = results.filter(r => r.validationStatus === 'OK').length;
  const notOk = results.filter(r => r.validationStatus === 'NOT OK').length;
  console.log(`\n🎉 Done! ✅ OK: ${ok} | ❌ NOT OK: ${notOk} | ⚠️ Errors: ${errors.length}`);

  browser.disconnect();
  process.exit(0);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
