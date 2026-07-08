import fs from 'fs';
import path from 'path';

// =================================================================
// 1. WAJIB: Tentukan URL yang mau di-scrape khusus untuk script ini
// =================================================================
export const url = 'https://vymanga.net/manga/checkmate-r';

// =================================================================
// 2. WAJIB: Buat fungsi default untuk mengeksekusi custom job-nya
// Parameter { page, domainDir } dikirim otomatis oleh index.js
// =================================================================
export default async function ambilDataManga({ page, domainDir }) {
  console.log('   -> 🕵️‍♂️ Mulai mengakses halaman manga...');

  // =================================================================
  // PENYESUAIAN CLOUDFLARE ("Just a moment...")
  // =================================================================
  console.log('   -> ⏳ Menunggu proses pengecekan Cloudflare...');
  
  try {
    // Kita meminta script untuk menunggu sampai judul halaman TIDAK mengandung kata "Just a moment"
    // Diberi batas waktu (timeout) 20 detik agar tidak stuck selamanya jika gagal
    await page.waitForFunction(
      () => {
        return !document.title.includes('Just a moment') && !document.title.includes('Cloudflare');
      },
      { timeout: 20000 }
    );
    
    // Tambahkan sedikit jeda ekstra (misal 3 detik) untuk memastikan elemen-elemen
    // di halaman yang sebenarnya (setelah lolos Cloudflare) sudah selesai dimuat.
    await page.waitForTimeout(3000);
    
    console.log('   -> ✅ Berhasil melewati atau tidak terkena hadangan Cloudflare!');
  } catch (error) {
    console.log('   -> ⚠️ Timeout! Cloudflare mungkin butuh waktu lebih lama atau halaman langsung terbuka.');
  }

  // =================================================================
  // 3. AMBIL SCREENSHOT DAN HTML
  // Kita simpan ke dalam folder domainDir
  // =================================================================
  
  // A. Ambil Screenshot
  console.log('   -> 📸 Mengambil screenshot (full page)...');
  const fileScreenshot = path.join(domainDir, 'hasil-screenshot.png');
  
  await page.screenshot({ 
    path: fileScreenshot, 
    fullPage: true // Set ke true agar memotret seluruh halaman dari atas ke bawah
  });
  console.log(`   -> 💾 Screenshot berhasil disave ke: hasil-screenshot.png`);


  // B. Ambil Source HTML
  console.log('   -> 📄 Mengekstrak kode HTML halamannya...');
  const isiHTML = await page.content(); // Mengambil seluruh struktur DOM halaman
  
  const fileHtml = path.join(domainDir, 'hasil-html.html');
  fs.writeFileSync(
    fileHtml, 
    isiHTML
  );
  console.log(`   -> 💾 Source HTML berhasil disave ke: hasil-html.html`);

  console.log('   -> ✨ Semua proses sukses diselesaikan!');
}
