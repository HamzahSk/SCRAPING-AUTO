import fs from 'fs';
import path from 'path';

export const url = 'https://vymanga.net/manga/checkmate-r';

// -----------------------------------------------------
// SETTING BROWSER: Kelihatan (headless: false) biar tembus Cloudflare
// -----------------------------------------------------
export const launchOptions = {
  headless: false,
  channel: 'chrome',
  args: ['--disable-blink-features=AutomationControlled']
};
 
// -----------------------------------------------------
// SETTING GOTO: Jangan nunggu networkidle
// -----------------------------------------------------
export const gotoOptions = {
  waitUntil: 'domcontentloaded', 
  timeout: 60000 
};

export default async function ambilDataManga({ page, domainDir }) {
  console.log('   -> 🕵️‍♂️ Mulai mengakses halaman manga...');
  console.log('   -> ⏳ Menunggu proses pengecekan Cloudflare...');
  
  try {
    // Kita tunggu elemen 'h1' (judul manga) muncul, tandanya berhasil lewat Cloudflare
    await page.waitForSelector('h1', { timeout: 30000 });
    await page.waitForTimeout(3000); // Ekstra waktu buat render gambar
    console.log('   -> ✅ Berhasil melewati hadangan Cloudflare!');
  } catch (error) {
    console.log('   -> ❌ GAGAL: Terjebak di Cloudflare atau Timeout.');
    return; // Langsung stop aja scriptnya biar ga nge-screenshot error
  }

  console.log('   -> 📸 Mengambil screenshot khusus manga...');
  const fileScreenshot = path.join(domainDir, 'hasil-manga-screenshot.png');
  await page.screenshot({ path: fileScreenshot, fullPage: true });

  console.log('   -> 📄 Mengekstrak kode HTML...');
  const isiHTML = await page.content(); 
  const fileHtml = path.join(domainDir, 'hasil-manga-html.html');
  fs.writeFileSync(fileHtml, isiHTML);
  
  console.log('   -> ✨ Semua proses custom manga selesai!');
}
