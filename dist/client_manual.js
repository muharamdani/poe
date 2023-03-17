import ChatBot from "./index.js";
const bot = new ChatBot();
// Used to check if the formkey and cookie is available
const isFormkeyAvailable = await bot.getCredentials();
if (!isFormkeyAvailable) {
    console.log("Formkey and cookie not available");
    // Set the formkey, cookie and any other data needed and save it into config.json
    await bot.setCredentials();
    const myEmail = "myemail@mail.com";
    const signInStatus = await bot.sendVerifCode(null, myEmail);
    // After you get the verification code, you can use this step to log in
    // then check signInStatus
    let loginStatus = "invalid_verification_code";
    while (loginStatus !== "success") {
        if (signInStatus === 'user_with_confirmed_phone_number_not_found') {
            loginStatus = await bot.signUpWithVerificationCode(myEmail, null, 123456); // 123456 is the verification code
        }
        else {
            loginStatus = await bot.signInOrUp(myEmail, null, 123456); // 123456 is the verification code
        }
    }
}
const ai = "a2"; // bot list are in config.example.json, key "chat_ids"
// If you want to clear the chat context, you can use this
await bot.clearContext(ai);
// If you want to get the response (with stream), you can use this
// NOTE that you need to call this before you send the message
// await getUpdatedSettings(bot.config.channel_name, bot.config.quora_cookie);
// await bot.subscribe();
// const ws = await connectWs();
// If you want to send a message, you can use this
await bot.sendMsg(ai, "Hello, who are you?");
// If you want to get the response (without stream), you can use this
const response = await bot.getResponse(ai);
console.log(response);
// // If you want to get the response (with stream), you can use this
// process.stdout.write("Response: ");
// await listenWs(ws);
// console.log('\n');
