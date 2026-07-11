import { targetUrls, capchaUrl, settings } from './config.js';
import { solveTurnstile } from './solver.js';
import winston from 'winston';
import fs from 'fs';

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

// Fungsi untuk menyimpan hasil
function saveResults(results) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `results_${timestamp}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  logger.info(`Results saved to ${filename}`);
}

async function main() {
  const results = [];

  // 1. Proses capchaUrl (dengan sitekey)
  if (capchaUrl && capchaUrl.length > 0) {
    logger.info('=== Processing captcha URLs with sitekey ===');
    
    for (const item of capchaUrl) {
      logger.info(`\n==========================================`);
      logger.info(`>>> Processing with sitekey: ${item.sitekey}`);
      logger.info(`>>> URL: ${item.url}`);
      logger.info(`==========================================`);

      try {
        const token = await solveTurnstile({
          sitekey: item.sitekey,
          siteurl: item.url,
          timeout: settings.timeout || 45
        });

        logger.info(`\x1b[32mToken obtained: ${token}\x1b[0m`);
        results.push({
          type: 'sitekey',
          url: item.url,
          sitekey: item.sitekey,
          token: token,
          success: true,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error(`Error: ${error.message}`);
        results.push({
          type: 'sitekey',
          url: item.url,
          sitekey: item.sitekey,
          error: error.message,
          success: false,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  // 2. Proses targetUrls (tanpa sitekey)
  if (targetUrls && targetUrls.length > 0) {
    logger.info('\n=== Processing target URLs without sitekey ===');
    
    for (const url of targetUrls) {
      logger.info(`\n==========================================`);
      logger.info(`>>> Processing: ${url}`);
      logger.info(`==========================================`);

      try {
        const result = await solveTurnstile({
          url: url,
          fastMode: settings.fastMode || false,
          proxy: settings.proxy || null,
          userAgent: settings.userAgent || null,
          timeout: settings.timeout || 45
        });

        logger.info(`\x1b[36mTitle: ${result.title}\x1b[0m`);
        logger.info(`\x1b[33mCookies: ${result.cookie || 'No cookies'}\x1b[0m`);
        logger.info(`\x1b[32mUA: ${result.userAgent}\x1b[0m`);

        results.push({
          type: 'url',
          url: url,
          title: result.title,
          cookie: result.cookie,
          userAgent: result.userAgent,
          success: true,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error(`Error processing ${url}: ${error.stack || error}`);
        results.push({
          type: 'url',
          url: url,
          error: error.message,
          success: false,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  if (results.length === 0) {
    logger.warn('No URLs to process. Check config.js');
    process.exit(0);
  }

  logger.info('\n=== Process completed ===');
  saveResults(results);
  
  // Tampilkan ringkasan
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  logger.info(`\n=== Summary ===`);
  logger.info(`Total processed: ${results.length}`);
  logger.info(`Success: ${successCount}`);
  logger.info(`Failed: ${failCount}`);
  
  // Tampilkan token yang berhasil
  const successfulTokens = results.filter(r => r.success && r.token);
  if (successfulTokens.length > 0) {
    logger.info(`\n=== Tokens obtained ===`);
    successfulTokens.forEach((r, i) => {
      logger.info(`${i+1}. ${r.token.substring(0, 30)}...`);
    });
  }
  
  process.exit(0);
}

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err.message}`);
  process.exit(1);
});

main();