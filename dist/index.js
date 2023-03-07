import fetch from "cross-fetch";
import prompts from "prompts";
import ora from "ora";
import * as dotenv from "dotenv";
import { readFileSync, writeFile } from "fs";
import scrape from "./credential.js";
import * as mail from "./mail.js";
dotenv.config();
const spinner = ora({
    color: "cyan",
});
const gqlDir = process.cwd() + "/graphql";
const queries = {
    chatViewQuery: readFileSync(gqlDir + "/ChatViewQuery.graphql", "utf8"),
    addMessageBreakMutation: readFileSync(gqlDir + "/AddMessageBreakMutation.graphql", "utf8"),
    chatPaginationQuery: readFileSync(gqlDir + "/ChatPaginationQuery.graphql", "utf8"),
    addHumanMessageMutation: readFileSync(gqlDir + "/AddHumanMessageMutation.graphql", "utf8"),
    loginMutation: readFileSync(gqlDir + "/LoginWithVerificationCodeMutation.graphql", "utf8"),
    signUpWithVerificationCodeMutation: readFileSync(gqlDir + "/SignupWithVerificationCodeMutation.graphql", "utf8"),
    sendVerificationCodeMutation: readFileSync(gqlDir + "/SendVerificationCodeForLoginMutation.graphql", "utf8"),
};
let [pbCookie, channelName, appSettings, formkey] = ["", "", "", ""];
class ChatBot {
    constructor() {
        this.headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'PostmanRuntime/7.31.1',
            'Accept': '*/*',
            'Host': 'poe.com',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        };
        this.chatId = 0;
        this.bot = "";
    }
    async getCredentials() {
        const credentials = JSON.parse(readFileSync("config.json", "utf8"));
        const { quora_formkey, quora_cookie } = credentials;
        console.log("FROM GET CREDENTIALS");
        console.log(quora_formkey);
        console.log(quora_cookie);
        if (quora_formkey.length > 0 && quora_cookie.length > 0) {
            formkey = quora_formkey;
            pbCookie = quora_cookie;
            // For websocket later feature
            channelName = credentials.channel_name;
            appSettings = credentials.app_settings;
            this.headers["poe-formkey"] = formkey;
            this.headers["Cookie"] = pbCookie;
        }
        return quora_formkey.length > 0 && quora_cookie.length > 0;
    }
    async setCredentials() {
        let result = await scrape();
        const credentials = JSON.parse(readFileSync("config.json", "utf8"));
        credentials.quora_formkey = result.appSettings.formkey;
        credentials.quora_cookie = result.pbCookie;
        // For websocket later feature
        credentials.channel_name = result.channelName;
        credentials.app_settings = result.appSettings;
        // set value
        formkey = result.appSettings.formkey;
        pbCookie = result.pbCookie;
        console.log("FROM SET CREDENTIALS");
        console.log(formkey);
        console.log(pbCookie);
        // For websocket later feature
        channelName = result.channelName;
        appSettings = result.appSettings;
        this.headers["poe-formkey"] = formkey;
        this.headers["Cookie"] = pbCookie;
        writeFile("config.json", JSON.stringify(credentials), function (err) {
            if (err) {
                console.log(err);
            }
        });
    }
    async start() {
        const isFormkeyAvailable = await this.getCredentials();
        if (!isFormkeyAvailable) {
            const { mode } = await prompts({
                type: "select",
                name: "mode",
                message: "Select",
                choices: [
                    { title: "Auto [This will use temp email to get Verification Code]", value: "auto" },
                    { title: "Semi-Auto [Use you own email/phone number]", value: "semi" },
                    { title: "exit", value: "exit" }
                ],
            });
            if (mode === "exit") {
                process.exit(0);
            }
            await this.setCredentials();
            await this.login(mode);
        }
        const { bot } = await prompts({
            type: "select",
            name: "bot",
            message: "Select",
            choices: [
                { title: "Claude (Powered by Anthropic)", value: "a2" },
                { title: "Sage (Powered by OpenAI - logical)", value: "capybara" },
                { title: "Dragonfly (Powered by OpenAI - simpler)", value: "nutria" },
                { title: "ChatGPT (Powered by OpenAI - current)", value: "chinchilla" },
            ],
        });
        await this.getChatId(bot);
        let helpMsg = "Available commands: !help !exit, !clear, !submit" +
            "\n!help - show this message" +
            "\n!exit - exit the chat" +
            "\n!clear - clear chat history" +
            "\n!submit - submit prompt";
        console.log(helpMsg);
        let submitedPrompt = "";
        while (true) {
            const { prompt } = await prompts({
                type: "text",
                name: "prompt",
                message: "Ask:",
            });
            if (prompt.length > 0) {
                if (prompt === "!help") {
                    console.log(helpMsg);
                }
                else if (prompt === "!exit") {
                    break;
                }
                else if (prompt === "!clear") {
                    spinner.start("Clearing chat history...");
                    await this.clearContext();
                    submitedPrompt = "";
                    spinner.stop();
                    console.log("Chat history cleared");
                }
                else if (prompt === "!submit") {
                    if (submitedPrompt.length === 0) {
                        console.log("No prompt to submit");
                        continue;
                    }
                    spinner.start("Waiting for response...");
                    await this.sendMsg(submitedPrompt);
                    let response = await this.getResponse();
                    spinner.stop();
                    submitedPrompt = "";
                    console.log(response);
                }
                else {
                    submitedPrompt += prompt + "\n";
                }
            }
        }
    }
    async makeRequest(request) {
        this.headers["Content-Length"] = Buffer.byteLength(JSON.stringify(request), 'utf8');
        const response = await fetch('https://poe.com/api/gql_POST', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(request)
        });
        return await response.json();
    }
    async login(mode) {
        if (mode === "auto") {
            const { email, sid_token } = await mail.createNewEmail();
            console.log("EMAIL: " + email);
            console.log("SID_TOKEN: " + sid_token);
            const status = await this.sendVerifCode(null, email);
            spinner.start("Waiting for OTP code...");
            const otp_code = await mail.getPoeOTPCode(sid_token);
            spinner.stop();
            if (status === 'user_with_confirmed_email_not_found') {
                await this.signUpWithVerificationCode(null, email, otp_code);
            }
            else {
                await this.signInOrUp(null, email, otp_code);
            }
        }
        else {
            const { type } = await prompts({
                type: "select",
                name: "type",
                message: "Select",
                choices: [
                    { title: "Email", value: "email" },
                    { title: "Phone number", value: "phone" },
                    { title: "exit", value: "exit" }
                ],
            });
            if (type === "exit") {
                process.exit(0);
            }
            const { credentials } = await prompts({
                type: "text",
                name: "credentials",
                message: "Enter your " + type + ":",
            });
            let status = '';
            if (type === "email") {
                status = await this.sendVerifCode(null, credentials);
            }
            else {
                status = await this.sendVerifCode(credentials, null);
            }
            const { verifyCode } = await prompts({
                type: "text",
                name: "verifyCode",
                message: "Enter your verification code:",
            });
            spinner.start("Waiting for verification code...");
            let loginStatus = "invalid_verification_code";
            while (loginStatus !== "success") {
                if (type === "email") {
                    if (status === 'user_with_confirmed_email_not_found') {
                        loginStatus = await this.signUpWithVerificationCode(null, credentials, verifyCode);
                    }
                    else {
                        loginStatus = await this.signInOrUp(null, credentials, verifyCode);
                    }
                }
                else if (type === "phone") {
                    if (status === 'user_with_confirmed_phone_number_not_found') {
                        loginStatus = await this.signUpWithVerificationCode(credentials, null, verifyCode);
                    }
                    else {
                        loginStatus = await this.signInOrUp(credentials, null, verifyCode);
                    }
                }
            }
            spinner.stop();
        }
    }
    async signInOrUp(phoneNumber, email, verifyCode) {
        console.log("Signing in/up...");
        console.log("Phone number: " + phoneNumber);
        console.log("Email: " + email);
        console.log("Verification code: " + verifyCode);
        try {
            const { data: { loginWithVerificationCode: { status: loginStatus }, }, } = await this.makeRequest({
                query: `${queries.loginMutation}`,
                variables: {
                    verificationCode: verifyCode,
                    emailAddress: email,
                    phoneNumber: phoneNumber
                },
            });
            console.log("Login Status: " + loginStatus);
            return loginStatus;
        }
        catch (e) {
            throw e;
        }
    }
    async signUpWithVerificationCode(phoneNumber, email, verifyCode) {
        console.log("Signing in/up...");
        console.log("Phone number: " + phoneNumber);
        console.log("Email: " + email);
        console.log("Verification code: " + verifyCode);
        try {
            const { data: { signupWithVerificationCode: { status: loginStatus }, }, } = await this.makeRequest({
                query: `${queries.signUpWithVerificationCodeMutation}`,
                variables: {
                    verificationCode: verifyCode,
                    emailAddress: email,
                    phoneNumber: phoneNumber
                },
            });
            console.log("Login Status: " + loginStatus);
            return loginStatus;
        }
        catch (e) {
            throw e;
        }
    }
    async sendVerifCode(phoneNumber, email) {
        try {
            // status error case: success, user_with_confirmed_phone_number_not_found, user_with_confirmed_email_not_found
            const { data: { sendVerificationCode: { status } } } = await this.makeRequest({
                query: `${queries.sendVerificationCodeMutation}`,
                variables: {
                    emailAddress: email,
                    phoneNumber: phoneNumber
                },
            });
            console.log("Verification code sent. Status: " + status);
            return status;
        }
        catch (e) {
            throw e;
        }
    }
    async getChatId(bot) {
        try {
            const { data: { chatOfBot: { chatId } } } = await this.makeRequest({
                query: `${queries.chatViewQuery}`,
                variables: {
                    bot,
                },
            });
            this.chatId = chatId;
            this.bot = bot;
        }
        catch (e) {
            throw new Error("Could not get chat id, invalid formkey or cookie! Please remove the quora_formkey value from the config.json file and try again.");
        }
    }
    async clearContext() {
        try {
            await this.makeRequest({
                query: `${queries.addMessageBreakMutation}`,
                variables: { chatId: this.chatId },
            });
        }
        catch (e) {
            throw new Error("Could not clear context");
        }
    }
    async sendMsg(query) {
        try {
            await this.makeRequest({
                query: `${queries.addHumanMessageMutation}`,
                variables: {
                    bot: this.bot,
                    chatId: this.chatId,
                    query: query,
                    source: null,
                    withChatBreak: false
                },
            });
        }
        catch (e) {
            throw new Error("Could not send message");
        }
    }
    async getResponse() {
        let text;
        let state;
        let authorNickname;
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            let response = await this.makeRequest({
                query: `${queries.chatPaginationQuery}`,
                variables: {
                    before: null,
                    bot: this.bot,
                    last: 1,
                },
            });
            let base = response.data.chatOfBot.messagesConnection.edges;
            let lastEdgeIndex = base.length - 1;
            text = base[lastEdgeIndex].node.text;
            authorNickname = base[lastEdgeIndex].node.authorNickname;
            state = base[lastEdgeIndex].node.state;
            if (state === "complete" && authorNickname === this.bot) {
                break;
            }
        }
        return text;
    }
}
const chatBot = new ChatBot();
await chatBot.start();
