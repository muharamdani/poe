import ChatBot from "./index.js";
const bot = new ChatBot();
// Used to check if the formkey and cookie is available
const isFormkeyAvailable = await bot.getCredentials();
if (!isFormkeyAvailable) {
    console.log("Formkey and cookie not available");
    // Set the formkey, cookie and any other data needed and save it into config.json
    await bot.setCredentials();
    const chatId = await bot.getChatId("a2");
    console.log(chatId);
}
