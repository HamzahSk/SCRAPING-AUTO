import winston from 'winston';
import { capchaUrl, settings } from './config.js';

const lang = process.argv.includes('--lang=en') ? 'en' : 'zh';

const i18n = {
  zh: {
    apiError: 'API 错误: ',
    locError: '定位报错: ',
    locSuccess: '[定位成功] 原始外框: ',
    clickPos: '[执行点击] 落脚点: ',
    foundCaptcha: '正在注入 Turnstile 验证码...',
    solved: '验证码已解决',
    timeout: '超时未获取到 token'
  },
  en: { 
    apiError: 'API Error: ',
    locError: 'Locator Error: ',
    locSuccess: '[Locator Success] Box: ',
    clickPos: '[Click Execution] Position: ',
    foundCaptcha: 'Injecting Turnstile widget...',
    solved: 'Challenge solved',
    timeout: 'Timeout: Token not obtained'
  }
};

const t = i18n[lang];

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
  ),
  transports: [new winston.transports.Console()]
});

const sleep = duration => new Promise(resolve => setTimeout(resolve, duration * 1000));

// Randomizer untuk meniru jeda dan posisi manusia
const randomUniform = (min, max) => Math.random() * (max - min) + min;

async function solveTurnstile(targetURL, sitekey, fastMode = false, proxy = null, customUA = null, timeout = 45) {
  const { launch } = await import("cloakbrowser/puppeteer");

  const launchArgs = [];
  if (customUA) {
    launchArgs.push(`--user-agent=${customUA}`);
    const uaLower = customUA.toLowerCase();
    
    if (uaLower.includes("mac os") || uaLower.includes("macintosh")) {
      launchArgs.push("--fingerprint-platform=macos");
    } else if (uaLower.includes("android")) {
      launchArgs.push("--fingerprint-platform=android");
    } else if (uaLower.includes("iphone") || uaLower.includes("ipad")) {
      launchArgs.push("--fingerprint-platform=ios");
    } else if (uaLower.includes("linux")) {
      launchArgs.push("--fingerprint-platform=linux");
    } else {
      launchArgs.push("--fingerprint-platform=windows");
    }
  }

  const launchOptions = {
    headless: false,
    humanize: true,
    args: launchArgs
  };

  if (proxy) {
    launchOptions.proxy = proxy;
    launchOptions.geoip = true;
  }

  const browser = await launch(launchOptions);
  
  try {
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    page.setDefaultNavigationTimeout(60 * 1000);
    
    await page.goto(targetURL, { waitUntil: "domcontentloaded" });
    await sleep(randomUniform(2.0, 3.0));

    logger.info(t.foundCaptcha);

    // 1. Injeksi Widget Turnstile secara paksa (Sesuai solver.py)
    await page.evaluate((key) => {
        if (document.getElementById('_ts_box')) return;
        window._tsToken = null;
        const wrap = document.createElement('div');
        wrap.id = '_ts_box';
        wrap.style = 'position:fixed;top:20px;left:20px;z-index:2147483647;';
        document.body.appendChild(wrap);
        window._tsLoad = function () {
            turnstile.render('#_ts_box', {
                sitekey: key,
                callback: function(token) { window._tsToken = token; }
            });
        };
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=_tsLoad&render=explicit';
        s.async = true;
        document.head.appendChild(s);
    }, sitekey);

    // Tunggu Turnstile dimuat (invisible mode mungkin langsung auto-solve)
    await sleep(5.0);

    const getToken = async () => {
        return await page.evaluate(() => {
            if (window._tsToken) return window._tsToken;
            const inp = document.querySelector('#_ts_box [name="cf-turnstile-response"]');
            return (inp && inp.value) ? inp.value : null;
        });
    };

    const getCfIframeRect = async () => {
        const raw = await page.evaluate(() => {
            for (const f of document.querySelectorAll('iframe')) {
                const src = f.src || f.getAttribute('src') || '';
                if (!src.includes('challenges.cloudflare.com')) continue;
                const r = f.getBoundingClientRect();
                if (r.width > 50 && r.height > 20) return {x: r.x, y: r.y, w: r.width, h: r.height};
            }
            return null;
        });
        return raw;
    };

    const doClick = async (rect) => {
        let cx, cy;
        if (rect) {
            cx = rect.x + 28 + randomUniform(-3, 3);
            cy = rect.y + rect.h / 2 + randomUniform(-3, 3);
            logger.debug(`${t.clickPos} Iframe Cloudflare di (${cx.toFixed(0)}, ${cy.toFixed(0)})`);
        } else {
            cx = 20 + 28 + randomUniform(-3, 3);
            cy = 20 + 32 + randomUniform(-3, 3);
            logger.debug(`${t.clickPos} Iframe tidak ada di DOM, klik posisi tetap di (${cx.toFixed(0)}, ${cy.toFixed(0)})`);
        }
        
        // Meniru gerakan mouse sebelum klik
        await page.mouse.move(cx - 80, cy - 20);
        await sleep(randomUniform(0.15, 0.25));
        await page.mouse.move(cx, cy);
        await sleep(randomUniform(0.08, 0.15));
        await page.mouse.click(cx, cy);
    };

    // 2. Cek apakah token sudah didapat (Auto-solve berhasil)
    let token = await getToken();
    if (token) {
        logger.info(t.solved);
        return { token };
    }

    // 3. Tunggu hingga iframe Cloudflare muncul
    let rect = null;
    for (let i = 0; i < 20; i++) {
        rect = await getCfIframeRect();
        if (rect) break;
        await sleep(0.5);
    }

    // 4. Loop Klik jika dibutuhkan
    const startTime = Date.now();
    const deadline = startTime + (timeout * 1000);
    let clickCount = 0;
    let lastClick = 0;

    while (Date.now() < deadline) {
        token = await getToken();
        if (token) {
            logger.info(t.solved);
            return { token };
        }

        const now = Date.now();
        if (clickCount === 0 || (!token && (now - lastClick) > 8000)) {
            if (clickCount >= 3) {
                await sleep(0.3);
                continue;
            }
            
            await doClick(rect);
            lastClick = Date.now();
            clickCount += 1;
            
            await sleep(1.0);
            rect = await getCfIframeRect() || rect;
            continue;
        }

        await sleep(0.3);
    }

    throw new Error(t.timeout);

  } finally {
    try {
      await browser.close();
    } catch (err) {
      logger.error(`Error closing browser: ${err.message}`);
    }
  }
}

// Main execution loop
async function main() {
  if (!capchaUrl || capchaUrl.length === 0) {
    logger.warn('Tidak ada target di config.js. Program dihentikan.');
    process.exit(0);
  }

  logger.info(`Memulai proses untuk ${capchaUrl.length} target...`);

  for (const item of capchaUrl) {
    const { url, sitekey } = item;
    
    if (!url || !sitekey) {
        logger.warn('Skipping: Target URL atau sitekey kosong di config.js.');
        continue;
    }

    logger.info(`\n==========================================`);
    logger.info(`>>> Memproses URL: ${url}`);
    logger.info(`>>> Sitekey: ${sitekey}`);
    logger.info(`==========================================`);
    
    try {
      const { token } = await solveTurnstile(
        url, 
        sitekey,
        settings.fastMode, 
        settings.proxy, 
        settings.userAgent,
        settings.timeout
      );
      
      logger.info(`\x1b[32m[SUKSES] Token Didapatkan:\x1b[0m \n${token}\n`);

      // TODO: Kamu bisa menyimpan token ini ke file jika butuh dibaca oleh service lain

    } catch (error) {
      logger.error(`${t.apiError} ${url} -> ${error.message || error}`);
    }
  }

  logger.info('\nProses selesai untuk semua URL. Keluar...');
  process.exit(0);
}

main();
