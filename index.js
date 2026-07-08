// index.js
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const outputDir = path.join(process.cwd(), 'results');
const customDir = path.join(process.cwd(), 'custom');

// Bikin folder kalau belum ada
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });

(async () => {
  // 1. CEK CONFIG NORMAL
  let normalUrls = [];
  try {
    const config = await import('./config.js');
    if (config.targetUrls) normalUrls = config.targetUrls;
  } catch (e) {
    console.log('⚠️ config.js tidak ditemukan atau tidak valid.');
  }

  // 2. CEK FILE CUSTOM
  const customFiles = fs.readdirSync(customDir).filter(f => f.endsWith('.js'));

  if (normalUrls.length === 0 && customFiles.length === 0) {
    console.log('⚠️ Tidak ada URL di config.js dan tidak ada file di folder custom/. Berhenti.');
    process.exit(0);
  }

  const browser = await chromium.launch();

  // =========================================================
  // FUNGSI UTAMA SCRAPING
  // =========================================================
  async function jalankanScrape(targetUrl, customModule = null) {
    const page = await browser.newPage();
    try {
      const hostname = new URL(targetUrl).hostname;
      const domainDir = path.join(outputDir, hostname);
      if (!fs.existsSync(domainDir)) fs.mkdirSync(domainDir, { recursive: true });

      console.log(`\n🌐 URL Target: ${targetUrl} (${hostname})`);

      // ---------------------------------------------------------
      // ✨ FITUR BARU: Ambil settingan page.goto dari file custom
      // ---------------------------------------------------------
      const defaultGotoOptions = { waitUntil: 'networkidle', timeout: 30000 };
      const gotoOptions = (customModule && customModule.gotoOptions) 
                          ? { ...defaultGotoOptions, ...customModule.gotoOptions } 
                          : defaultGotoOptions;

      console.log(`   -> Menggunakan opsi goto: ${JSON.stringify(gotoOptions)}`);
      await page.goto(targetUrl, gotoOptions);

      // -- JOB DEFAULT (Selalu Dijalankan) --
      const pageTitle = await page.title();
      const headings = await page.$$eval('h1', (elements) => elements.map(el => el.textContent.trim()).filter(text => text.length > 0));
      const waktuScrape = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

      fs.writeFileSync(path.join(domainDir, `info.json`), JSON.stringify({ url: targetUrl, waktuScrape, judulHalaman: pageTitle, h1_teks: headings }, null, 2));
      const fullHTML = await page.content();
      fs.writeFileSync(path.join(domainDir, `source.html`), fullHTML);
      await page.screenshot({ path: path.join(domainDir, `screenshot.png`), fullPage: true });
      
      console.log(`✅ File default (JSON, HTML, PNG) aman di folder results/${hostname}/`);

      // -- JOB CUSTOM (Dijalankan Kalau Ada File Custom-nya) --
      if (customModule && typeof customModule.default === 'function') {
        console.log(`⚙️  Menjalankan script custom...`);
        await customModule.default({ page, url: targetUrl, domainDir, browser });
        console.log(`✅ Custom job berhasil!`);
      }
    } catch (error) {
      console.error(`❌ Gagal scrape URL [${targetUrl}]:`, error.message);
    } finally {
      await page.close(); 
    }
  }

  // =========================================================
  // EKSEKUSI JALUR NORMAL (Dari config.js)
  // =========================================================
  if (normalUrls.length > 0) {
    console.log(`\n==================================================`);
    console.log(`🚀 JALUR NORMAL: Mendeteksi ${normalUrls.length} URL dari config.js`);
    for (const url of normalUrls) {
      await jalankanScrape(url);
    }
  }

  // =========================================================
  // EKSEKUSI JALUR CUSTOM (Dari folder custom/)
  // =========================================================
  if (customFiles.length > 0) {
    console.log(`\n==================================================`);
    console.log(`🛠️  JALUR CUSTOM: Mendeteksi ${customFiles.length} file di folder custom/`);
    for (const file of customFiles) {
      try {
        const scriptPath = pathToFileURL(path.join(customDir, file)).href;
        const customModule = await import(scriptPath);
        
        if (!customModule.url) {
          console.log(`\n⏭️  Skip: File ${file} tidak memiliki 'export const url'.`);
          continue;
        }
        
        console.log(`\n▶️  Mengeksekusi file custom: ${file}`);
        await jalankanScrape(customModule.url, customModule);
      } catch (err) {
        console.error(`❌ Error membaca file custom [${file}]:`, err.message);
      }
    }
  }

  await browser.close();
  console.log(`\n🎉 Semua proses (Normal & Custom) selesai!`);
})();
