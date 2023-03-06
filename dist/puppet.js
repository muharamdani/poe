import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
const scrape = async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    // navigate to poe.com/login
    await page.goto('https://poe.com/login');
    // get the value of the p-b cookie
    const pbCookie = await page.cookies().then(cookies => cookies.find(cookie => cookie.name === 'p-b').value);
    // wait for the channelName item to be set in local storage, then extract its value
    await page.waitForFunction(() => localStorage.getItem('poe-tchannel-channel') !== null);
    const channelName = await page.evaluate(() => localStorage.getItem('poe-tchannel-channel'));
    const settingsUrl = `https://poe.com/api/settings?channel=${channelName}`;
    const appSettings = await fetch(settingsUrl, {
        headers: {
            Cookie: `p-b=${pbCookie}`
        }
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        return response.json(); // return as JSON data
    }).then(data => {
        return data; // return the JSON data
    }).catch(error => {
        console.error('Error:', error);
        return null;
    });
    await browser.close();
    return {
        pbCookie,
        channelName,
        appSettings
    };
};
export default scrape;
