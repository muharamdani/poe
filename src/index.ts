import {ApolloClient, InMemoryCache, gql} from "@apollo/client/core/core.cjs";
import {HttpLink} from "@apollo/client/link/http/http.cjs";
import makeSession from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import fetch from "cross-fetch";
import prompts from "prompts";
import ora from "ora";
import * as dotenv from "dotenv";
import {readFileSync, writeFile} from "fs";
import axios from 'axios';
import { JSDOM } from 'jsdom';

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
    sendVerificationCodeMutation: readFileSync(gqlDir + "/SendVerificationCodeForLoginMutation.graphql", "utf8"),
};

let baseURL: string = "www.quora.com/poe_api";

const jar = new CookieJar();
let session = makeSession(fetch, jar);
const response = await session(`https://${baseURL}/settings`, {
    method: "GET",
});

let {formkey} = await response.json();
let cookies = jar.getCookiesSync(`https://${baseURL}/settings`);
let cookie = "m-b=";
for(let i = 0; i < cookies.length; i++) {
    if (cookies[i].key === "m-b") {
        cookie += cookies[i].value;
    }
}

class ChatBot {
    private client: any;
    public async createClient(mode) {
        let headers = {
            "Host": "www.quora.com",
            "Accept": "*/*",
            "apollographql-client-version": "1.1.6-65",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "Poe 1.1.6 rv:65 env:prod (iPhone14,2; iOS 16.2; en_US)",
            "apollographql-client-name": "com.quora.app.Experts-apollo-ios",
            "Connection": "keep-alive",
            "Content-Type": "application/json",
        }

        if (mode !== "manual") {
            const isFormkeyAvailable = await this.getCredentials();
            if (!isFormkeyAvailable) {
                await this.setCredentials()
            }
        }

        if (mode === "auto" || mode === "semi") {
            headers["Quora-Formkey"] = formkey;
            headers["Cookie"] = cookie;
        } else {
            headers["Quora-Formkey"] = process.env.QUORA_FORMKEY || "";
            headers["Cookie"] = process.env.MB_COOKIE || "";
        }
        console.log("Headers: " + JSON.stringify(headers));
        this.client = new ApolloClient({
            link: new HttpLink({
                fetch: session,
                uri: `https://${baseURL}/gql_POST`,
                headers: headers,
            }),
            cache: new InMemoryCache(),
            defaultOptions: {
                watchQuery: {
                    fetchPolicy: "no-cache",
                    errorPolicy: "ignore",
                },
                query: {
                    fetchPolicy: "no-cache",
                    errorPolicy: "all",
                },
            }
        });
    }

    private chatId: number = 0;
    private bot: string = "";

    private async getCredentials() {
        const credentials = JSON.parse(readFileSync("config.json", "utf8"));
        const {quora_formkey, quora_cookie} = credentials;
        if (quora_formkey.length > 0 && quora_cookie.length > 0) {
            formkey = quora_formkey;
            cookie = quora_cookie;
        }
        return quora_formkey.length > 0 && quora_cookie.length > 0;
    }

    private async setCredentials() {
        const credentials = JSON.parse(readFileSync("config.json", "utf8"));
        credentials.quora_formkey = formkey;
        credentials.quora_cookie = cookie;
        writeFile("config.json", JSON.stringify(credentials), function(err) {
            if (err) {
                console.log(err);
            }
        });
    }

    public async start() {
        const {mode} = await prompts({
            type: "select",
            name: "mode",
            message: "Select",
            choices: [
                {title: "Auto [This will use temp phone number to get Verification Code]", value: "auto"},
                {title: "Semi-Auto [Use you own email/phone number]", value: "semi"},
                {title: "Manual [Input QUORA_FORMKEY and MB_COOKIE in .env manually]", value: "manual"},
                {title: "exit", value: "exit"}
            ],
        });

        if (mode === "exit") {
            return;
        }

        await this.createClient(mode);
        await this.login(mode)

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

    public async login(mode: string) {
        if (mode === "auto") {
            const {phoneNumber, smsCodeUrl} = await this.getPhoneNumber();
            console.log("Your phone number: " + phoneNumber);
            console.log("Your SMS code URL: " + smsCodeUrl);

            let smsCode = await this.getSMSCode(smsCodeUrl);
            if (smsCode.length === 0) {
                await this.sendVerifCode(phoneNumber, null);
            }

            while (smsCode.length === 0) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                smsCode = await this.getSMSCode(smsCodeUrl);
            }

            let loginStatus = "invalid_verification_code";
            spinner.start("Waiting for SMS code...");
            let retryCount = 0;
            while (loginStatus === "invalid_verification_code") {
                await new Promise(resolve => setTimeout(resolve, 60000));
                smsCode = await this.getSMSCode(smsCodeUrl);
                loginStatus = await this.signInOrUp(phoneNumber, null, smsCode[0])
                retryCount++;
                if (retryCount == 2) {
                    await this.sendVerifCode(phoneNumber, null);
                }
            }
            spinner.stop();
        } else if (mode === "semi") {
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

            if (type === "email") {
                await this.sendVerifCode(null, credentials);
            } else {
                await this.sendVerifCode(credentials, null);
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
                    loginStatus = await this.signInOrUp(null, credentials, verifyCode)
                } else if (type === "phone") {
                    loginStatus = await this.signInOrUp(credentials, null, verifyCode)
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
        const {
            data: {
                loginWithVerificationCode: { status: loginStatus },
            },
        } = await this.client.mutate({
            mutation: gql`${queries.loginMutation}`,
            variables: {
                verificationCode: verifyCode,
                emailAddress: email,
                phoneNumber: phoneNumber
            },
        });
        console.log("Login Status: " + loginStatus)
        return loginStatus;
    }

    private async sendVerifCode(phoneNumber, email) {
        const {
            data: {
                sendVerificationCode: { status: codeSendStatus },
            },
        } = await this.client.mutate({
            mutation: gql`${queries.sendVerificationCodeMutation}`,
            variables: {
                emailAddress: email,
                phoneNumber: phoneNumber
            },
        });

        console.log("Send Status: " + codeSendStatus)
    }

    private async getPhoneNumber() {
        const freeSmsBaseUrl = 'https://www.receivesms.co';
        const url = freeSmsBaseUrl + '/us-phone-numbers/us/';
        let smsCodeUrl = '';
        let phoneNumber = '';
        try {
            const response = await axios.get(url);
            const dom = new JSDOM(response.data);
            phoneNumber = dom.window.document.querySelector('a.btn').getAttribute('data-clipboard-text');
            const code = dom.window.document.querySelector('td a[target="_self"]').getAttribute('href');
            smsCodeUrl = freeSmsBaseUrl + code;
        } catch (error) {
            console.log(error);
        }
        return {phoneNumber, smsCodeUrl};
    }

    private async getSMSCode(smsCodeUrl: string) {
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
        console.log("Verification code: " + latestCode)
        return latestCode;
    }

    private async getChatId(bot: string) {
        const {data: {chatOfBot: {chatId}}} = await this.client.query({
            query:  gql`${queries.chatViewQuery}`,
            variables: {
                bot,
            },
        });
        this.chatId = chatId;
        this.bot = bot;
    }

    private async clearContext() {
        await this.client.mutate({
            mutation: gql`${queries.addMessageBreakMutation}`,
            variables: {chatId: this.chatId},
        });
    }

    private async sendMsg(query: string) {
        await this.client.mutate({
            mutation: gql`${queries.addHumanMessageMutation}`,
            variables: {
                bot: this.bot,
                chatId: this.chatId,
                query: query,
                source: null,
                withChatBreak: false
            },
        });
    }

    private async getResponse(): Promise<string> {
        let text: string
        let state: string
        let authorNickname: string
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            let response = await this.client.query({
                query: gql`${queries.chatPaginationQuery}`,
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
