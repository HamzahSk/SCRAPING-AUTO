import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import winston from 'winston';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'solver.log' })
  ]
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function findChromePath() {
  const os = process.platform;
  const paths = [];

  if (process.env.CHROME_PATH) {
    paths.push(process.env.CHROME_PATH);
  }

  if (os === 'win32') {
    paths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    );
  } else if (os === 'darwin') {
    paths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    );
  } else {
    paths.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    );
  }

  for (const path of paths) {
    if (fs.existsSync(path)) {
      return path;
    }
  }

  return undefined;
}

// Metode dengan sitekey (dari solver.py)
async function solveWithSitekey(sitekey, siteurl, timeout = 45) {
  logger.info(`[solver] Solving with sitekey: ${sitekey} at ${siteurl}`);
  
  const chromePath = await findChromePath();
  
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({
      width: 1280 + Math.floor(Math.random() * 100),
      height: 720 + Math.floor(Math.random() * 100)
    });

    // Navigate to URL
    await page.goto(siteurl, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    await sleep(2000 + Math.random() * 1000);

    // Inject Turnstile widget (sama seperti di solver.py)
    await page.evaluate(`
      (() => {
        if (document.getElementById('_ts_box')) return;
        window._tsToken = null;
        const wrap = document.createElement('div');
        wrap.id = '_ts_box';
        wrap.style = 'position:fixed;top:20px;left:20px;z-index:2147483647;';
        document.body.appendChild(wrap);
        window._tsLoad = function () {
          turnstile.render('#_ts_box', {
            sitekey: '${sitekey}',
            callback: function(token) { window._tsToken = token; }
          });
        };
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=_tsLoad&render=explicit';
        s.async = true;
        document.head.appendChild(s);
      })();
    `);

    logger.debug('[solver] Turnstile widget injected, waiting for load...');
    await sleep(5000);

    const getToken = async () => {
      return await page.evaluate(`
        (() => {
          if (window._tsToken) return window._tsToken;
          const inp = document.querySelector('#_ts_box [name="cf-turnstile-response"]');
          return (inp && inp.value) ? inp.value : null;
        })()
      `);
    };

    const getIframeRect = async () => {
      return await page.evaluate(`
        (() => {
          for (const f of document.querySelectorAll('iframe')) {
            const src = f.src || f.getAttribute('src') || '';
            if (!src.includes('challenges.cloudflare.com')) continue;
            const r = f.getBoundingClientRect();
            if (r.width > 50 && r.height > 20) return {x:r.x, y:r.y, w:r.width, h:r.height};
          }
          return null;
        })()
      `);
    };

    // Check if already solved
    let token = await getToken();
    if (token) {
      logger.info('[solver] Token already obtained!');
      return token;
    }

    // Wait for iframe
    logger.debug('[solver] Waiting for iframe...');
    let rect = null;
    for (let i = 0; i < 20; i++) {
      rect = await getIframeRect();
      if (rect) {
        logger.debug(`[solver] Iframe found at x=${rect.x.toFixed(1)}, y=${rect.y.toFixed(1)}`);
        break;
      }
      await sleep(500);
    }

    const doClick = async (rectData) => {
      let x, y;
      if (rectData) {
        x = rectData.x + 28 + (Math.random() * 6 - 3);
        y = rectData.y + rectData.h / 2 + (Math.random() * 6 - 3);
        logger.debug(`[solver] clicking Cloudflare iframe at (${x.toFixed(0)}, ${y.toFixed(0)})`);
      } else {
        x = 20 + 28 + (Math.random() * 6 - 3);
        y = 20 + 32 + (Math.random() * 6 - 3);
        logger.debug(`[solver] iframe not in DOM, clicking fixed position (${x.toFixed(0)}, ${y.toFixed(0)})`);
      }
      
      // Human-like mouse movement
      await page.mouse.move(x - 80 + Math.random() * 20, y - 20 + Math.random() * 20);
      await sleep(150 + Math.random() * 100);
      await page.mouse.move(x, y);
      await sleep(80 + Math.random() * 70);
      await page.mouse.click(x, y);
      
      // Random delay after click
      await sleep(200 + Math.random() * 300);
    };

    // Click loop
    const deadline = Date.now() + (timeout * 1000);
    let clickCount = 0;
    let lastClick = 0;

    while (Date.now() < deadline) {
      token = await getToken();
      if (token) {
        logger.info('[solver] Token obtained successfully!');
        break;
      }

      const now = Date.now();
      if (clickCount === 0 || (now - lastClick > 8000)) {
        if (clickCount >= 3) {
          logger.debug('[solver] Max clicks reached, waiting...');
          await sleep(300);
          continue;
        }
        logger.debug(`[solver] Click attempt ${clickCount + 1}`);
        await doClick(rect);
        lastClick = Date.now();
        clickCount++;
        await sleep(1000);
        rect = await getIframeRect() || rect;
        continue;
      }

      await sleep(300);
    }

    if (!token) {
      throw new Error(`Turnstile token not obtained within ${timeout}s`);
    }

    return token;

  } finally {
    await browser.close();
  }
}

// Metode tanpa sitekey (dari script asli)
async function solveWithoutSitekey(targetURL, fastMode = false, proxy = null, customUA = null, timeout = 45) {
  logger.info(`[solver] Solving without sitekey at ${targetURL}`);
  
  const chromePath = await findChromePath();
  
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled'
  ];

  if (customUA) {
    launchArgs.push(`--user-agent=${customUA}`);
  }

  if (proxy) {
    launchArgs.push(`--proxy-server=${proxy}`);
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    args: launchArgs
  });

  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({
      width: 1280 + Math.floor(Math.random() * 100),
      height: 720 + Math.floor(Math.random() * 100)
    });

    await page.goto(targetURL, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });

    const userAgent = await page.evaluate(() => navigator.userAgent);
    const content = await page.content();

    if (content.includes('challenge-platform')) {
      logger.info('[solver] Found CloudFlare challenge');

      let isResolved = false;
      let interval;

      const checkTurnstile = async () => {
        try {
          // Cari wrapper turnstile
          const wrapper = await page.evaluate(() => {
            const elements = document.querySelectorAll('div');
            for (const el of elements) {
              if (el.querySelector('input[name="cf-turnstile-response"]')) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 250 && rect.height > 40) {
                  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }
              }
            }
            return null;
          });

          if (wrapper) {
            logger.debug(`[solver] [Locator Success] Box: x=${wrapper.x.toFixed(1)}, y=${wrapper.y.toFixed(1)}, w=${wrapper.width.toFixed(1)}, h=${wrapper.height.toFixed(1)}`);

            await sleep(1500 + Math.random() * 1000);

            const x = wrapper.x + 20 + (Math.random() * 6 - 3);
            const y = wrapper.y + 30 + (Math.random() * 6 - 3);

            logger.debug(`[solver] [Click Execution] Position: x=${x.toFixed(1)}, y=${y.toFixed(1)}`);
            
            // Human-like click
            await page.mouse.move(x - 50 + Math.random() * 20, y - 20 + Math.random() * 20);
            await sleep(100 + Math.random() * 100);
            await page.mouse.move(x, y);
            await sleep(50 + Math.random() * 50);
            await page.mouse.click(x, y);
            
            return true;
          }
          return false;
        } catch (err) {
          logger.debug(`[solver] Locator Error: ${err.message}`);
          return false;
        }
      };

      // Mulai interval check
      interval = setInterval(async () => {
        if (isResolved) return;
        try {
          await checkTurnstile();
        } catch (err) {
          // Ignore
        }
      }, 1000);

      // Fast mode: cek cf_clearance
      if (fastMode) {
        logger.info('[solver] FastMode enabled - checking for cf_clearance');
        for (let i = 0; i < 20; i++) {
          await sleep(1000);
          if (page.isClosed()) break;
          const cookies = await page.cookies();
          if (cookies.some(c => c.name === 'cf_clearance')) {
            logger.info('[solver] FastMode: cf_clearance obtained, ending early!');
            isResolved = true;
            break;
          }
          if (i % 5 === 0) {
            logger.debug(`[solver] Waiting for cf_clearance... (${i+1}/20)`);
          }
        }
      } else {
        // Wait for solve
        logger.info(`[solver] Waiting up to ${timeout}s for challenge to solve...`);
        await sleep(timeout * 1000);
      }

      clearInterval(interval);

      // Get final state
      let title = '', cookie = '';
      if (!page.isClosed()) {
        title = await page.title();
        const cookies = await page.cookies();
        cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const finalContent = await page.content();
        if (!finalContent.includes('challenge-platform')) {
          logger.info('[solver] Challenge solved!');
        } else {
          logger.warn('[solver] Challenge may not be fully solved');
        }
      }

      return { title, cookie, userAgent };

    } else {
      logger.info('[solver] No challenge detected');
      if (!fastMode) {
        await sleep(timeout * 1000);
      }
      
      let title = '', cookie = '';
      if (!page.isClosed()) {
        title = await page.title();
        const cookies = await page.cookies();
        cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      }
      return { title, cookie, userAgent };
    }

  } finally {
    try {
      await browser.close();
    } catch (err) {
      logger.error(`[solver] Error closing browser: ${err.message}`);
    }
  }
}

// Export fungsi utama
export async function solveTurnstile(options = {}) {
  const { sitekey, siteurl, url, fastMode, proxy, userAgent, timeout } = options;
  
  if (sitekey && siteurl) {
    // Metode dengan sitekey
    return await solveWithSitekey(sitekey, siteurl, timeout || 45);
  } else if (url) {
    // Metode tanpa sitekey
    return await solveWithoutSitekey(url, fastMode || false, proxy || null, userAgent || null, timeout || 45);
  } else {
    throw new Error('Either (sitekey + siteurl) or url must be provided');
  }
}