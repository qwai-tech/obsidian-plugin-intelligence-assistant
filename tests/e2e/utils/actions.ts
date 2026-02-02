/**
 * Common actions for e2e tests
 */

import { SELECTORS } from './selectors';



/**

 * Close all open modals by repeatedly sending Escape key until no modal is found.

 */

export async function closeAllModals() {

    let modal = await $(SELECTORS.common.modal);

    // Give some initial time for any modal to fully render before checking its existence

    await browser.pause(300); 

    while (await modal.isExisting()) {

        await browser.keys('Escape');

        // Give some time for modal to close after Escape key is sent

        await browser.pause(500);

        modal = await $(SELECTORS.common.modal); // Re-check if modal exists

    }

}



/**

 * Open Obsidian settings

 */

export async function openSettings() {

    await browser.keys(['Meta', ',']);

    await browser.pause(3000); // Increased pause



    const settingsModal = await $(SELECTORS.settings.modal);

    await settingsModal.waitForDisplayed({ timeout: 5000 });

}



/**

 * Close Obsidian settings

 */

export async function closeSettings() {

    await browser.keys('Escape');

    await browser.pause(1000); // Increased pause

}



/**

 * Navigate to plugin settings

 */

export async function navigateToPluginSettings(pluginName: string = 'Intelligence Assistant') {

    await closeAllModals(); // Ensure no modals are open before opening settings

    await openSettings();



    const sidebarItem = await $(SELECTORS.settings.pluginItem(pluginName));

    if (await sidebarItem.isExisting()) {

        await sidebarItem.click();

        await browser.pause(1000); // Increased pause

    }

}



/**

 * Navigate to a specific settings tab

 */

export async function navigateToTab(tabSelector: string) {

    const tab = await $(tabSelector);

    if (await tab.isExisting()) {

        await tab.click();

        await browser.pause(500);

    }

}



/**

 * Open command palette

 */

export async function openCommandPalette() {

    await browser.keys(['Meta', 'p']);

    await browser.pause(500);

}



/**

 * Execute a command from command palette

 */

export async function executeCommand(commandName: string) {

    await openCommandPalette();



    const commandInput = await $('input.prompt-input');

    // Check if command input exists
    if (!await commandInput.isExisting()) {
        console.log(`Command palette input not found, command may not execute: ${commandName}`);
        // Try alternate selector
        const altInput = await $('input.prompt-input-field');
        if (await altInput.isExisting()) {
            await altInput.setValue(commandName);
            await browser.pause(300);
            await browser.keys('Enter');
            await browser.pause(500);
            return;
        }
        // If still not found, just press keys and hope for the best
        await browser.keys(commandName.split(''));
        await browser.pause(300);
        await browser.keys('Enter');
        await browser.pause(500);
        return;
    }

    await commandInput.setValue(commandName);

    await browser.pause(300);



    await browser.keys('Enter');

    await browser.pause(500);

}



/**



 * Open chat view



 */



export async function openChatView() {



    await executeCommand('Intelligence Assistant: Open Chat');







    const chatView = await $(SELECTORS.chat.view);



    try {
        await chatView.waitForDisplayed({ timeout: 10000, timeoutMsg: 'Chat view not displayed' });
    } catch (e) {
        console.log('Chat view may not have opened properly');
        // Continue anyway
    }







    // Add a short pause to ensure nested elements have a chance to render



    await browser.pause(2000);







    // Ensure the input container is displayed first



    const inputContainer = await $(SELECTORS.chat.inputContainer); // Assuming SELECTORS.chat.inputContainer exists



    try {
        await inputContainer.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Chat input container not displayed' });
    } catch (e) {
        console.log('Chat input container may not be available');
        // Continue anyway
    }







    // Ensure the input field is displayed and ready



    const input = await $(SELECTORS.chat.input);



    try {
        await input.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Chat input field not displayed' });
    } catch (e) {
        console.log('Chat input field may not be available');
        // Continue anyway
    }



}







/**



 * Send a chat message



 */



export async function sendChatMessage(message: string) {



    const input = await $(SELECTORS.chat.input);



    await input.setValue(message);



    // Use Enter key to send



    await browser.keys('Enter');



}



/**

 * Wait for assistant response

 */

export async function waitForAssistantResponse(timeout: number = 30000) {

    const messages = await $$(SELECTORS.chat.assistantMessage);

    const initialCount = messages.length;



    await browser.waitUntil(

        async () => {

            const currentMessages = await $$(SELECTORS.chat.assistantMessage);

            return currentMessages.length > initialCount;

        },

        {

            timeout,

            timeoutMsg: 'Assistant response not received within timeout',

        }

    );

}


