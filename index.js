// index.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

(async () => {
  console.log(`Memulai scraping untuk ${config.targetUrls.length} website...`);
  
  // Buat folder 'results' jika belum ada
  const outputDir = path.join(__dirname, 'results');
  if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
  }

  // Buka browser
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  for (const url of config.targetUrls) {
    try {
      const hostname = new URL(url).hostname;
      console.log(`--------------------------------------------------`);
      console.log(`Scraping: ${url} (${hostname})`);
      
      // Buka halaman
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // =========================================================
      // 1. DATA JSON (Judul, Teks h1, Waktu)
      // =========================================================
      const pageTitle = await page.title();
      const headings = await page.$$eval('h1', (elements) => 
        elements.map(el => el.textContent.trim()).filter(text => text.length > 0)
      );
      const waktuScrape = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

      const hasilScrape = {
        url: url,
        domain: hostname,
        waktuScrape: waktuScrape,
        judulHalaman: pageTitle,
        h1_teks: headings
      };
      
      fs.writeFileSync(
        path.join(outputDir, `${hostname}.json`), 
        JSON.stringify(hasilScrape, null, 2)
      );

      // =========================================================
      // 2. HTML ORIGINAL 
      // Mengambil 100% struktur HTML asli dari website tersebut
      // =========================================================
      const fullHTML = await page.content();
      fs.writeFileSync(path.join(outputDir, `${hostname}.html`), fullHTML);

      // =========================================================
      // 3. SCREENSHOT FULL HALAMAN
      // Menyimpan tangkapan layar dari atas sampai paling bawah
      // =========================================================
      await page.screenshot({ 
        path: path.join(outputDir, `${hostname}.png`), 
        fullPage: true 
      });

      console.log(`✅ Berhasil! File disimpan: ${hostname}.json, ${hostname}.html, dan ${hostname}.png`);

    } catch (error) {
      console.error(`❌ Gagal scraping URL [${url}]:`, error.message);
    }
  }

  // Tutup browser
  await browser.close();
  console.log(`\n--------------------------------------------------`);
  console.log(`Semua proses scraping selesai!`);
})();
