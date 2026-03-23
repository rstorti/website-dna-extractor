const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function check() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto('https://mazda.com', { waitUntil: 'networkidle2' });

    const logoUrl = await page.evaluate(() => {
        let src = "";
        const imgs = Array.from(document.querySelectorAll('img')).filter(img => img.src && !img.src.includes('onetrust'));

        // 1. Look for definitive Logo class/ID/alt/src first
        const strongLogo = imgs.find(img =>
            /logo/i.test(img.className) ||
            /logo/i.test(img.id) ||
            /^logo$/i.test(img.alt) ||
            /logo\.(png|svg|jpg)/i.test(img.src)
        );
        if (strongLogo) return strongLogo.src;

        // 2. Look at header/nav images
        const headerImgs = Array.from(document.querySelectorAll('header img, nav img, .globalnavigation img, .header img')).filter(img => img.src && !img.src.includes('onetrust'));
        if (headerImgs.length > 0) return headerImgs[0].src;

        // 3. Fallbacks
        return document.querySelector('meta[property="og:image"]')?.content ||
            document.querySelector('link[rel="apple-touch-icon"]')?.href;
    });

    console.log("BEST LOGO:", logoUrl);
    await browser.close();
}
check();
