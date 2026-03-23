const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function getOGP() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto('https://mazda.com', { waitUntil: 'networkidle2' });
    const ogp = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content);
    console.log("OGP IS:", ogp);
}
getOGP();
