import browser from "webextension-polyfill";

export const storage = {
    async get(keys){
        return await browser.storage.local.get(keys);
    },

    async set(data){
        return await browser.storage.local.set(data);
    },

    async remove(keys){
        return await browser.storage.local.remove(keys);
    },

    onChange(callback){
        browser.storage.onChanged.addListener((changes, area) => {
            if(area === 'local') {
                callback(changes);
            }
        });
    }
}

export const messaging = {
    async sendToBackground(message){
        return await browser.runtime.sendMessage(message);
    },

    async sendToTab(tabId, message){
        return await browser.tabs.sendMessage(tabId, message);
    },


    onMessage(callback){
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            const result = callback(message, sender);
            if(result instanceof Promise){
                result.then(sendResponse);
                return true; // Keep the message channel open for async response
            }
            return false;

        })
    }
}

export async function getActiveTab(){
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true
    })
    return tabs[0];
}