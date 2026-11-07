const { test, expect } = require('@playwright/test');

/**
 * Login test suite for www.alza.cz
 *
 * Login form lives on https://identity.alza.cz/Account/Login and is opened
 * from the "Moje Alza" header menu on the home page.
 *
 * Valid login needs a real account, pass it through environment variables:
 *   PowerShell:  $env:ALZA_USER="you@mail.cz"; $env:ALZA_PASSWORD="secret"; npx playwright test alzaLogin
 * Without them the valid-login test is skipped.
 */

const VALID_USER = process.env.ALZA_USER;
const VALID_PASSWORD = process.env.ALZA_PASSWORD;
const UNKNOWN_EMAIL = 'qa.invalid.user.test@example.com';

// Run one by one - parallel runs against the live site trigger bot protection
test.describe.configure({ mode: 'default' });

async function openLoginPage(page) {
    await page.goto('https://www.alza.cz/');
    // Cloudflare check ("Okamžik…") may be shown first, so wait for the header
    const accountMenu = page.getByTestId('headerContextMenuToggle');
    await accountMenu.waitFor({ timeout: 45000 });

    const cookieButton = page.getByRole('button', { name: 'Rozumím' });
    if (await cookieButton.isVisible()) {
        await cookieButton.click();
    }

    await accountMenu.click();
    await page.getByTestId('headerNavigationLogin').click();

    await expect(page).toHaveURL(/identity\.alza\.cz\/Account\/Login/i);
    await expect(page.getByRole('heading', { name: 'Přihlášení' })).toBeVisible();
    // Links stay "disabled" until page scripts (incl. form validation) are ready
    await expect(page.locator('#forgotPasswordLink')).not.toHaveClass(/disabled/);
    await page.waitForLoadState('load');
}

// Click submit (again) until the client-side validation message is shown
async function submitAndExpectValidation(page, button, text) {
    await expect(async () => {
        await button.click();
        await expect(validationMessage(page, text)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
}

const userName = (page) => page.locator('#userName');
const password = (page) => page.locator('#password');
const loginButton = (page) => page.locator('#btnLogin');
const forgotPasswordLink = (page) => page.locator('#forgotPasswordLink');
const validationMessage = (page, text) => page.locator('.validation-message', { hasText: text });

test.describe('Valid login', () => {

    test('TC01 - user logs in with valid e-mail and password', async ({ page }) => {
        test.skip(!VALID_USER || !VALID_PASSWORD, 'Set ALZA_USER and ALZA_PASSWORD to run valid login');

        await openLoginPage(page);
        await userName(page).fill(VALID_USER);
        await password(page).fill(VALID_PASSWORD);
        await loginButton(page).click();

        // After login user is sent back to the shop and the "Přihlásit se" link is gone
        await expect(page).toHaveURL(/^https:\/\/www\.alza\.cz\//, { timeout: 30000 });
        await page.getByTestId('headerContextMenuToggle').click();
        await expect(page.getByTestId('headerNavigationLogin')).toHaveCount(0);
    });
});

test.describe('Invalid login', () => {

    test.beforeEach(async ({ page }) => {
        await openLoginPage(page);
    });

    test('TC02 - empty e-mail and password show both validation messages', async ({ page }) => {
        await submitAndExpectValidation(page, loginButton(page), 'Zadejte e-mailovou adresu');
        await expect(validationMessage(page, 'Zadejte prosím heslo')).toBeVisible();
        await expect(page).toHaveURL(/Account\/Login/i);
    });

    test('TC03 - empty password shows password validation message', async ({ page }) => {
        await userName(page).fill(UNKNOWN_EMAIL);
        await submitAndExpectValidation(page, loginButton(page), 'Zadejte prosím heslo');

        await expect(validationMessage(page, 'Zadejte e-mailovou adresu')).toBeHidden();
        await expect(page).toHaveURL(/Account\/Login/i);
    });

    test('TC04 - empty e-mail shows e-mail validation message', async ({ page }) => {
        await password(page).fill('SomePassword123!');
        await submitAndExpectValidation(page, loginButton(page), 'Zadejte e-mailovou adresu');

        await expect(validationMessage(page, 'Zadejte prosím heslo')).toBeHidden();
        await expect(page).toHaveURL(/Account\/Login/i);
    });

    test('TC05 - unregistered e-mail and wrong password do not log user in', async ({ page }) => {
        await userName(page).fill(UNKNOWN_EMAIL);
        await password(page).fill('WrongPassword123!');
        await loginButton(page).click();

        // User must stay on the identity login page - no redirect back to the shop
        await page.waitForTimeout(10000);
        await expect(page).toHaveURL(/identity\.alza\.cz\/Account\/Login/i);
        await expect(userName(page)).toBeVisible();
        await expect(password(page)).toBeVisible();
    });

    test('TC06 - e-mail in wrong format does not log user in', async ({ page }) => {
        await userName(page).fill('not-an-email');
        await password(page).fill('WrongPassword123!');
        await loginButton(page).click();

        await page.waitForTimeout(10000);
        await expect(page).toHaveURL(/identity\.alza\.cz\/Account\/Login/i);
        await expect(userName(page)).toBeVisible();
    });

    test('TC07 - password field hides typed characters', async ({ page }) => {
        await expect(password(page)).toHaveAttribute('type', 'password');
    });
});

test.describe('Forgot password', () => {

    test.beforeEach(async ({ page }) => {
        await openLoginPage(page);
        await forgotPasswordLink(page).click();
        await expect(page).toHaveURL(/Account\/forgotpassword/i);
    });

    test('TC08 - "Zapomenuté heslo?" link opens forgot password page', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Zapomenuté heslo' })).toBeVisible();
        await expect(userName(page)).toBeVisible();
        await expect(page.locator('#sendButton')).toHaveText('Obnovit heslo');
    });

    test('TC09 - empty e-mail shows validation message', async ({ page }) => {
        await submitAndExpectValidation(page, page.locator('#sendButton'), 'Zadejte e-mailovou adresu');

        await expect(page).toHaveURL(/Account\/forgotpassword/i);
    });

    test('TC10 - submitting e-mail shows reset link sent confirmation', async ({ page }) => {
        await userName(page).fill(UNKNOWN_EMAIL);
        await page.locator('#sendButton').click();

        await expect(page).toHaveURL(/ForgotPasswordEmailSent/, { timeout: 30000 });
        await expect(page.getByText('Na váš email byl odeslán odkaz pro reset hesla')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Zpět na přihlašovací obrazovku' })).toBeVisible();
    });

    test('TC11 - "Zpět" button returns to login page', async ({ page }) => {
        await page.getByRole('link', { name: 'Zpět' }).click();

        await expect(page).toHaveURL(/Account\/Login/i);
        await expect(page.getByRole('heading', { name: 'Přihlášení' })).toBeVisible();
    });
});
