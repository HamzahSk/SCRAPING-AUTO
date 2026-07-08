// index.js
const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./config');

(async () => {
  console.log(`Mulai scraping ke: ${config.targetUrl}`);
  
  // Buka browser
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Pergi ke URL target
    await page.goto(config.targetUrl, { waitUntil: 'networkidle' });
    
    // Contoh scraping: Ambil judul halaman dan semua teks di tag <h1>
    const pageTitle = await page.title();
    const headings = await page.$$eval('h1', (elements) => 
      elements.map(el => el.textContent.trim())
    );

    // Kumpulin datanya
    const hasilScrape = {
      url: config.targetUrl,
      waktuScrape: new Date().toISOString(),
      judulHalaman: pageTitle,
      h1_teks: headings
    };

    // Simpan ke file hasil-scrape.json
    fs.writeFileSync('hasil-scrape.json', JSON.stringify(hasilScrape, null, 2));
    console.log('Scraping selesai! Hasil disimpan di hasil-scrape.json');

  } catch (error) {
    console.error('Yah, ada error pas scraping:', error);
  } finally {
    // Tutup browser
    await browser.close();
  }
})();
