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
  console.log('   -> ⏳ Menunggu proses pengecekan Cloudflare benar-benar selesai...');
  
  try {
    // ✨ SOLUSI: Tunggu sampai judul halaman ATAU teks H1 tidak mengandung elemen Cloudflare
    await page.waitForFunction(
      () => {
        const title = document.title.toLowerCase();
        const h1 = document.querySelector('h1')?.textContent?.toLowerCase() || '';
        
        // Pastikan halaman sudah memuat sesuatu, dan TIDAK ada kata proteksi Cloudflare
        const isCloudflareTitle = title.includes('just a moment') || title.includes('cloudflare');
        const isCloudflareH1 = h1.includes('just a moment') || h1.includes('checking your browser');
        
        return !isCloudflareTitle && !isCloudflareH1 && title.length > 0;
      },
      { timeout: 45000 } // Beri waktu maksimal 45 detik untuk verifikasi di GitHub Actions
    );

    // Beri jeda ekstra 5 detik (5000ms) setelah lolos Cloudflare 
    // agar gambar cover manga & struktur web aslinya selesai dimuat sempurna
    await page.waitForTimeout(5000); 
    console.log('   -> ✅ BERHASIL! Konfirmasi lolos Cloudflare. Masuk ke halaman asli.');
  } catch (error) {
    console.log('   -> ❌ GAGAL: Terjebak di Cloudflare atau Timeout (45 detik).');
    return; // Stop script agar tidak memotret halaman yang salah
  }

  // =================================================================
  // PROSES SAVE (Hanya berjalan kalau lolos try-catch di atas)
  // =================================================================
  console.log('   -> 📸 Mengambil screenshot khusus manga...');
  const fileScreenshot = path.join(domainDir, 'hasil-manga-screenshot.png');
  await page.screenshot({ path: fileScreenshot, fullPage: true });
  console.log(`   -> 💾 Screenshot asli berhasil disave ke: hasil-manga-screenshot.png`);

  console.log('   -> 📄 Mengekstrak kode HTML asli...');
  const isiHTML = await page.content(); 
  const fileHtml = path.join(domainDir, 'hasil-manga-html.html');
  fs.writeFileSync(fileHtml, isiHTML);
  console.log(`   -> 💾 Source HTML asli berhasil disave ke: hasil-manga-html.html`);
  
  console.log('   -> ✨ Semua proses custom manga selesai!');
}
