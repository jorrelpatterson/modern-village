// ═══════════════════════════════════════════════════════════════
// MODERN VILLAGE — BACB REGISTRY SCRAPER
// ═══════════════════════════════════════════════════════════════
//
// Scrapes the BACB public registry at https://www.bacb.com/services/o.php/verify
// for certified behavior analysts (BCBA, BCBA-D, BCaBA, RBT).
//
// NOTE: The BACB registry is a public, searchable database by design.
// This scraper is legal but should be used respectfully with rate limiting.
//
// IMPORTANT: The selectors in this file are TEMPLATES. The actual BACB form
// structure may differ and/or change over time. If results come back empty,
// open https://www.bacb.com/services/o.php/verify in a browser, inspect the
// state dropdown / submit button / result rows, and update the selectors
// marked with "TODO: adjust selector" below.
//
// SETUP:
//   npm install puppeteer csv-writer
//
// USAGE:
//   node scraper-bacb.js CA          — Pull all CA certified BCBAs
//   node scraper-bacb.js all         — Pull all 50 states (slow)
//
// OUTPUT: output/bacb-bcbas-{state}.csv
// ═══════════════════════════════════════════════════════════════

const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

async function scrapeBACB(state = 'CA') {
  log(`═══ BACB SCRAPER: ${state} ═══`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const results = [];

  try {
    // Navigate to BACB registry
    await page.goto('https://www.bacb.com/services/o.php/verify', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    log('Page loaded. Selecting state...');

    // TODO: adjust selector — the state dropdown selector may differ
    try {
      await page.select('select[name="state"]', state);
    } catch (e) {
      log('State selector not found — page structure may have changed. Check bacb.com manually.');
    }

    // TODO: adjust selector — submit button
    try {
      await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
      ]);
    } catch (e) {
      log('Submit failed — attempting alternative flow');
    }

    // Scrape result pages
    let pageNum = 1;
    while (true) {
      log(`Scraping page ${pageNum}...`);

      // TODO: adjust selectors — row/cell selectors for result table
      const pageResults = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr, .result-row, .verify-result');
        const data = [];
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, .cell, .field');
          if (cells.length >= 3) {
            data.push({
              name: cells[0] ? cells[0].textContent.trim() : '',
              certType: cells[1] ? cells[1].textContent.trim() : '',
              certNumber: cells[2] ? cells[2].textContent.trim() : '',
              state: cells[3] ? cells[3].textContent.trim() : '',
              status: cells[4] ? cells[4].textContent.trim() : '',
              expiration: cells[5] ? cells[5].textContent.trim() : ''
            });
          }
        });
        return data;
      });

      results.push(...pageResults);
      log(`  Found ${pageResults.length} records (total: ${results.length})`);

      // TODO: adjust selector — pagination "next" link
      const hasNext = await page.evaluate(() => {
        const nextBtn = document.querySelector('a.next, button.next, a[rel="next"]');
        if (nextBtn && !nextBtn.disabled) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (!hasNext) break;
      await delay(2500); // Rate limit: be nice
      pageNum++;

      if (pageNum > 200) {
        log('Safety limit reached (200 pages). Stopping.');
        break;
      }
    }

    // Write to CSV
    if (results.length > 0) {
      const csvWriter = createObjectCsvWriter({
        path: path.join(OUTPUT_DIR, `bacb-bcbas-${state.toLowerCase()}.csv`),
        header: [
          { id: 'name', title: 'Name' },
          { id: 'certType', title: 'Certification Type' },
          { id: 'certNumber', title: 'Certification Number' },
          { id: 'state', title: 'State' },
          { id: 'status', title: 'Status' },
          { id: 'expiration', title: 'Expiration' }
        ]
      });
      await csvWriter.writeRecords(results);
      log(`✅ Saved: output/bacb-bcbas-${state.toLowerCase()}.csv (${results.length} records)`);
    } else {
      log('⚠️ No results found. The BACB site structure may have changed — inspect manually at https://www.bacb.com/services/o.php/verify');
    }
  } catch (err) {
    log(`Error: ${err.message}`);
  } finally {
    await browser.close();
  }

  return results;
}

// CLI dispatch
const cmd = process.argv[2] || 'CA';
if (cmd === 'all') {
  const states = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
  (async () => {
    for (const s of states) {
      await scrapeBACB(s);
      await delay(3000);
    }
  })();
} else {
  scrapeBACB(cmd.toUpperCase());
}
