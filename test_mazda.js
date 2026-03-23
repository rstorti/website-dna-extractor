const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function check() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto('https://mazda.com', { waitUntil: 'networkidle2' });

    const elements = await page.evaluate(() => {
        const og = document.querySelector('meta[property="og:image"]')?.content;
        const apple = document.querySelector('link[rel="apple-touch-icon"]')?.href;
        const icon = document.querySelector('link[rel="icon"]')?.href;
        const potentialLogos = Array.from(document.querySelectorAll('img')).map(el => el.src).filter(src => src && !src.includes('onetrust') && (src.includes('logo') || src.includes('mazda')));
        return { og, apple, icon, potentialLogos };
    });
    console.log(JSON.stringify(elements, null, 2));
    await browser.close();
}
check();
