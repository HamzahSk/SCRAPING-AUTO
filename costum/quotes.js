import fs from 'fs';
import path from 'path';

// =================================================================
// 1. WAJIB: Tentukan URL yang mau di-scrape khusus untuk script ini
// =================================================================
export const url = 'https://quotes.toscrape.com';


// =================================================================
// 2. WAJIB: Buat fungsi default untuk mengeksekusi custom job-nya
// Parameter { page, domainDir } dikirim otomatis oleh index.js
// =================================================================
export default async function ambilDataQuotes({ page, domainDir }) {
  console.log('   -> 🕵️‍♂️ Mulai mencari data quotes...');

  // Kita pakai Playwright untuk mengambil elemen spesifik di halaman
  // Di website ini, setiap kutipan ada di dalam class HTML '.quote'
  const daftarQuotes = await page.$$eval('.quote', (elemenQuotes) => {
    
    // Looping setiap kotak kutipan yang ditemukan
    return elemenQuotes.map(kotak => {
      // Ambil teks kutipannya
      const isiTeks = kotak.querySelector('.text')?.textContent?.trim() || '';
      // Ambil nama penulisnya
      const penulis = kotak.querySelector('.author')?.textContent?.trim() || '';
      // Ambil tag/kategorinya (bisa lebih dari satu, jadi diubah ke Array)
      const tags = Array.from(kotak.querySelectorAll('.tags .tag')).map(t => t.textContent?.trim());
      
      // Kembalikan sebagai objek rapi
      return { 
        kutipan: isiTeks, 
        penulis: penulis, 
        kategori: tags 
      };
    });
  });

  console.log(`   -> ✨ Berhasil menemukan ${daftarQuotes.length} quotes!`);

  // =================================================================
  // 3. SIMPAN HASILNYA
  // Kita simpan ke dalam folder domainDir (results/quotes.toscrape.com/)
  // =================================================================
  const fileTujuan = path.join(domainDir, 'hasil-quotes.json');
  
  fs.writeFileSync(
    fileTujuan, 
    JSON.stringify(daftarQuotes, null, 2)
  );

  console.log(`   -> 💾 Data spesifik berhasil disave ke: hasil-quotes.json`);
}
