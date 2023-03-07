import fetch from "cross-fetch";
import prompts from "prompts";
import ora from "ora";
import * as dotenv from "dotenv";
import {readFileSync, writeFile} from "fs";
import axios from 'axios';
import { JSDOM } from 'jsdom';
import scrape from "./puppet.js";
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
    private headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'PostmanRuntime/7.31.1',
        'Accept': '*/*',
        'Host': 'poe.com',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
    }

    public async setMode(mode) {
        if (mode !== "manual") {
            const isFormkeyAvailable = await this.getCredentials();
            if (!isFormkeyAvailable) {
                await this.setCredentials()
            }
        } else {
            this.headers["poe-formkey"] = process.env.FORMKEY || "";
            this.headers["Quora-Formkey"] = process.env.FORMKEY || "";
            this.headers["Cookie"] = process.env.COOKIE || "";
        }
    }

    private chatId: number = 0;
    private bot: string = "";

    private async getCredentials() {
        const credentials = JSON.parse(readFileSync("config.json", "utf8"));
        const {quora_formkey, quora_cookie} = credentials;
        if (quora_formkey.length > 0 && quora_cookie.length > 0) {
            formkey = quora_formkey;
            pbCookie = `p-b=${quora_cookie}`;
            // For websocket later feature
            channelName = credentials.channel_name;
            appSettings = credentials.app_settings;
            this.headers["poe-formkey"] = formkey;
            this.headers["Cookie"] = pbCookie;
        }
        return quora_formkey.length > 0 && quora_cookie.length > 0;
    }

    private async setCredentials() {
        let result = await scrape();
        const credentials = JSON.parse(readFileSync("config.json", "utf8"));
        credentials.quora_formkey = result.appSettings.formkey;;
        credentials.quora_cookie = result.pbCookie;
        // For websocket later feature
        credentials.channel_name = result.channelName;
        credentials.app_settings = result.appSettings;

        // set value
        formkey = result.appSettings.formkey;
        pbCookie = result.pbCookie;
        // For websocket later feature
        channelName = result.channelName;
        appSettings = result.appSettings;
        this.headers["poe-formkey"] = formkey;
        this.headers["Cookie"] = `p-b=${pbCookie}`
        writeFile("config.json", JSON.stringify(credentials), function(err) {
            if (err) {
                console.log(err);
            }
        });
    }

    public async start() {
        const isFormkeyAvailable = await this.getCredentials();
        if (!isFormkeyAvailable) {
            const {mode} = await prompts({
                type: "select",
                name: "mode",
                message: "Select",
                choices: [
                    {title: "Auto [This will use temp email to get Verification Code]", value: "auto"},
                    {title: "Semi-Auto [Use you own email/phone number]", value: "semi"},
                    {title: "Manual [Input FORMKEY and COOKIE in .env manually]", value: "manual"},
                    {title: "exit", value: "exit"}
                ],
            });

            if (mode === "exit") {
                return;
            }

            await this.setMode(mode);
            await this.login(mode)
        }

        const {bot} = await prompts({
            type: "select",
            name: "bot",
            message: "Select",
            choices: [
                {title: "Claude (Powered by Anthropic)", value: "a2"},
                {title: "Sage (Powered by OpenAI - logical)", value: "capybara"},
                {title: "Dragonfly (Powered by OpenAI - simpler)", value: "nutria"},
                {title: "ChatGPT (Powered by OpenAI - current)", value: "chinchilla"},
            ],
        });

        await this.getChatId(bot);

        let helpMsg = "Available commands: !help !exit, !clear, !submit" +
            "\n!help - show this message" +
            "\n!exit - exit the chat" +
            "\n!clear - clear chat history" +
            "\n!submit - submit prompt";

        console.log(helpMsg)
        let submitedPrompt = "";
        while (true) {
            const {prompt} = await prompts({
                type: "text",
                name: "prompt",
                message: "Ask:",
            });

            if (prompt.length > 0) {
                if (prompt === "!help") {
                    console.log(helpMsg);
                } else if (prompt === "!exit") {
                    break;
                } else if (prompt === "!clear") {
                    spinner.start("Clearing chat history...");
                    await this.clearContext();
                    submitedPrompt = "";
                    spinner.stop();
                    console.log("Chat history cleared");
                } else if (prompt === "!submit") {
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
                } else {
                    submitedPrompt += prompt + "\n";
                }
            }
        }
    }

    private async makeRequest(request) {
        this.headers["Content-Length"] = Buffer.byteLength(JSON.stringify(request), 'utf8');

        const response = await fetch('https://poe.com/api/gql_POST', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(request)
        });

        return await response.json();
    }

    public async login(mode: string) {
        if (mode === "auto") {
            const {email, sid_token} = await mail.createNewEmail()
            console.log("EMAIL: " + email)
            console.log("SID_TOKEN: " + sid_token)
            const status = await this.sendVerifCode(null, email);
            spinner.start("Waiting for OTP code...");
            const otp_code = await mail.getPoeOTPCode(sid_token);
            spinner.stop();
            if (status === 'user_with_confirmed_email_not_found') {
                await this.signUpWithVerificationCode(null, email, otp_code)
            } else {
                await this.signInOrUp(null, email, otp_code)
            }
        }
        else if (mode === "semi") {
            const {type} = await prompts({
                type: "select",
                name: "type",
                message: "Select",
                choices: [
                    {title: "Email", value: "email"},
                    {title: "Phone number", value: "phone"},
                    {title: "exit", value: "exit"}
                ],
            });

            if (type === "exit") {
                return;
            }

            const {credentials} = await prompts({
                type: "text",
                name: "credentials",
                message: "Enter your " + type + ":",
            });
            let status = '';
            if (type === "email") {
                status = await this.sendVerifCode(null, credentials);
            } else {
                status = await this.sendVerifCode(credentials, null);
            }

            const {verifyCode} = await prompts({
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
                    } else {
                        loginStatus = await this.signInOrUp(null, credentials, verifyCode);
                    }
                } else if (type === "phone") {
                    if (status === 'user_with_confirmed_phone_number_not_found') {
                        loginStatus = await this.signUpWithVerificationCode(credentials, null, verifyCode);
                    } else {
                        loginStatus = await this.signInOrUp(credentials, null, verifyCode);
                    }
                }
            }
            spinner.stop();
        } else {
            console.log("Manual mode selected");
        }
    }

    private async signInOrUp(phoneNumber, email, verifyCode) {
        console.log("Signing in/up...")
        console.log("Phone number: " + phoneNumber)
        console.log("Email: " + email)
        console.log("Verification code: " + verifyCode)
        try {
            const {
                data: {
                    loginWithVerificationCode: { status: loginStatus },
                },
            } = await this.makeRequest({
                query: `${queries.loginMutation}`,
                variables: {
                    verificationCode: verifyCode,
                    emailAddress: email,
                    phoneNumber: phoneNumber
                },
            });
            console.log("Login Status: " + loginStatus)
            return loginStatus;
        } catch (e) {
            throw e;
        }
    }

    private async signUpWithVerificationCode(phoneNumber, email, verifyCode) {
        console.log("Signing in/up...")
        console.log("Phone number: " + phoneNumber)
        console.log("Email: " + email)
        console.log("Verification code: " + verifyCode)
        try {
            const {
                data: {
                    signupWithVerificationCode: { status: loginStatus },
                },
            } = await this.makeRequest({
                query: `${queries.signUpWithVerificationCodeMutation}`,
                variables: {
                    verificationCode: verifyCode,
                    emailAddress: email,
                    phoneNumber: phoneNumber
                },
            });
            console.log("Login Status: " + loginStatus)
            return loginStatus;
        } catch (e) {
            throw e;
        }
    }

    private async sendVerifCode(phoneNumber, email) {
        try {
            // status error case: success, user_with_confirmed_phone_number_not_found, user_with_confirmed_email_not_found
            const { data: { sendVerificationCode: { status } } } = await this.makeRequest({
                query: `${queries.sendVerificationCodeMutation}`,
                variables: {
                    emailAddress: email,
                    phoneNumber: phoneNumber
                },
            });
            console.log("Verification code sent. Status: " + status)
            return status;
        } catch (e) {
            throw e;
        }
    }

    // DEPRECATED
    public async getPhoneNumber() {
        const freeSmsBaseUrl = 'https://www.receivesms.co';
        const url = freeSmsBaseUrl + '/active-numbers/';
        let smsCodeUrl = '';
        let phoneNumber = '';
        let code = '';
        try {
            const response = await axios.get(url);
            const dom = new JSDOM(response.data);

            const buttons = dom.window.document.querySelectorAll('a.btn');
            const phoneNumbers = [];
            buttons.forEach(button => {
                const phoneNumber = button.getAttribute('data-clipboard-text');
                phoneNumbers.push(phoneNumber);
            });

            const codes = dom.window.document.querySelectorAll('td a[target="_self"]')
            const phoneCodes = [];
            codes.forEach(code => {
                const codeText = code.getAttribute('href');
                phoneCodes.push(codeText);
            });
            const position = Math.floor(Math.random() * phoneNumbers.length);
            phoneNumber = phoneNumbers[position];
            code = phoneCodes[position];
            smsCodeUrl = freeSmsBaseUrl + code;
        } catch (error) {
            console.log(error);
        }

        console.log("Your phone number: " + phoneNumber);
        console.log("Your SMS code URL: " + smsCodeUrl);

        return {phoneNumber, smsCodeUrl};
    }

    // DEPRECATED
    private async getOTP(smsCodeUrl: string) {
        let latestCode = [];
        try {
            const res = await fetch(smsCodeUrl);
            const html = await res.text();
            const dom = new JSDOM(html);
            const elements = dom.window.document.querySelectorAll(".col-xs-12.col-md-8");
            elements.forEach((element) => {
                const text = element.textContent;
                if (text && text.includes("Your Poe verification code is:")) {
                    const code = element.querySelector(".btn1")?.getAttribute("data-clipboard-text");
                    if (code) {
                        latestCode.push(code);
                    }
                    return;
                }
            });
        } catch (error) {
            console.log("Error:", error);
        }

        return latestCode;
    }

    // Safe
    private async getChatId(bot: string) {
        try {
            const {data: {chatOfBot: {chatId}}}= await this.makeRequest({
                query:  `${queries.chatViewQuery}`,
                variables: {
                    bot,
                },
            });
            this.chatId = chatId;
            this.bot = bot;
        } catch (e) {
            throw new Error("Could not get chat id, invalid formkey or cookie");
        }
    }

    // Safe
    private async clearContext() {
        try {
            await this.makeRequest({
                query: `${queries.addMessageBreakMutation}`,
                variables: {chatId: this.chatId},
            });
        } catch (e) {
            throw new Error("Could not clear context");
        }
    }

    // Safe
    private async sendMsg(query: string) {
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
        } catch (e) {
            throw new Error("Could not send message");
        }
    }

    // Safe
    private async getResponse(): Promise<string> {
        let text: string
        let state: string
        let authorNickname: string
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
            let base = response.data.chatOfBot.messagesConnection.edges
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
