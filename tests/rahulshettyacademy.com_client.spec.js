

const {test, expect} = require('@playwright/test');


test.only('basic test', async ({browser}) => 
{
  ///chrome - plugins/ cookies
    
    const context = await browser.newContext();
    const page = await context.newPage();
    const userName = page.locator('#userEmail');
    const signIn = page.locator("#login");
    const cardTitles = page.locator(".card-body b");
    await page.goto('https://rahulshettyacademy.com/client/#/auth/login');
    console.log(await page.title ());
    await userName.fill("somorpheus@gmail.com");
    await page.locator("#userPassword").fill("Kosmos80");
    await signIn.click();

    // allTextContents() does not wait, so wait for the products to load first
    await page.waitForLoadState('networkidle');
    await cardTitles.first().waitFor();

    // Receive all product titles on the page as an array of strings
    const allTitles = await cardTitles.allTextContents();
    console.log(allTitles);
    
    
});

