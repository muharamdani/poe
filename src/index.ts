import fetch from "cross-fetch";
import prompts from "prompts";
import ora from "ora";
import * as dotenv from "dotenv";
import {readFileSync, writeFile, existsSync, statSync} from "fs";
import {getUpdatedSettings, scrape} from "./credential.js";
import {connectWs, disconnectWs, listenWs} from "./websocket.js";
import * as mail from "./mail.js";
import randomUseragent from 'random-useragent'

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

class ChatBot {
    public config = JSON.parse(readFileSync("config.json", "utf8"));

    private headers = {
        'Content-Type': 'application/json',
        'Host': 'poe.com',
        'Connection': 'keep-alive',
        'Origin': 'https://poe.com',
        'User-Agent': randomUseragent.getRandom(),
    }

    public chatId: number = 0;
    public bot: string = "";

    public reConnectWs = false;

    public async getCredentials() {
        const {quora_formkey, channel_name, quora_cookie} = this.config;
        if (quora_formkey.length > 0 && quora_cookie.length > 0) {
            this.headers["poe-formkey"] = quora_formkey;
            this.headers["poe-tchannel"] = channel_name;
            this.headers["Cookie"] = quora_cookie;
        }
        return quora_formkey.length > 0 && quora_cookie.length > 0;
    }

    public async setChatIds() {
        const [a2, capybara, nutria, chinchilla] = await Promise.all([
            this.getChatId("a2"),
            this.getChatId("capybara"),
            this.getChatId("nutria"),
            this.getChatId("chinchilla"),
        ]);

        const credentials = JSON.parse(readFileSync("config.json", "utf8"));

        credentials.chat_ids = {
            a2,
            capybara,
            nutria,
            chinchilla,
        };

        this.config.chat_ids = {
            a2,
            capybara,
            nutria,
            chinchilla,
        }

        writeFile("config.json", JSON.stringify(credentials, null, 4), function (err) {
            if (err) {
                console.log(err);
            }
        });
    }

    public async setCredentials() {
        let result = await scrape();
        this.config.quora_formkey = result.appSettings.formkey;
        this.config.quora_cookie = result.pbCookie;
        this.config.channel_name = result.channelName;
        this.config.app_settings = result.appSettings;

        // set value
        this.headers["poe-formkey"] = this.config.quora_formkey;
        this.headers["poe-tchannel"] = this.config.channel_name;
        this.headers["Cookie"] = this.config.quora_cookie;

        writeFile("config.json", JSON.stringify(this.config, null, 4), function (err) {
            if (err) {
                console.log(err);
            }
        });
    }

    public async subscribe() {
        const query = {
            queryName: 'subscriptionsMutation',
            variables: {
                subscriptions: [
                    {
                        subscriptionName: 'messageAdded',
                        query: 'subscription subscriptions_messageAdded_Subscription(\n  $chatId: BigInt!\n) {\n  messageAdded(chatId: $chatId) {\n    id\n    messageId\n    creationTime\n    state\n    ...ChatMessage_message\n    ...chatHelpers_isBotMessage\n  }\n}\n\nfragment ChatMessageDownvotedButton_message on Message {\n  ...MessageFeedbackReasonModal_message\n  ...MessageFeedbackOtherModal_message\n}\n\nfragment ChatMessageDropdownMenu_message on Message {\n  id\n  messageId\n  vote\n  text\n  ...chatHelpers_isBotMessage\n}\n\nfragment ChatMessageFeedbackButtons_message on Message {\n  id\n  messageId\n  vote\n  voteReason\n  ...ChatMessageDownvotedButton_message\n}\n\nfragment ChatMessageOverflowButton_message on Message {\n  text\n  ...ChatMessageDropdownMenu_message\n  ...chatHelpers_isBotMessage\n}\n\nfragment ChatMessageSuggestedReplies_SuggestedReplyButton_message on Message {\n  messageId\n}\n\nfragment ChatMessageSuggestedReplies_message on Message {\n  suggestedReplies\n  ...ChatMessageSuggestedReplies_SuggestedReplyButton_message\n}\n\nfragment ChatMessage_message on Message {\n  id\n  messageId\n  text\n  author\n  linkifiedText\n  state\n  ...ChatMessageSuggestedReplies_message\n  ...ChatMessageFeedbackButtons_message\n  ...ChatMessageOverflowButton_message\n  ...chatHelpers_isHumanMessage\n  ...chatHelpers_isBotMessage\n  ...chatHelpers_isChatBreak\n  ...chatHelpers_useTimeoutLevel\n  ...MarkdownLinkInner_message\n}\n\nfragment MarkdownLinkInner_message on Message {\n  messageId\n}\n\nfragment MessageFeedbackOtherModal_message on Message {\n  id\n  messageId\n}\n\nfragment MessageFeedbackReasonModal_message on Message {\n  id\n  messageId\n}\n\nfragment chatHelpers_isBotMessage on Message {\n  ...chatHelpers_isHumanMessage\n  ...chatHelpers_isChatBreak\n}\n\nfragment chatHelpers_isChatBreak on Message {\n  author\n}\n\nfragment chatHelpers_isHumanMessage on Message {\n  author\n}\n\nfragment chatHelpers_useTimeoutLevel on Message {\n  id\n  state\n  text\n  messageId\n}\n'
                    },
                    {
                        subscriptionName: 'viewerStateUpdated',
                        query: 'subscription subscriptions_viewerStateUpdated_Subscription {\n  viewerStateUpdated {\n    id\n    ...ChatPageBotSwitcher_viewer\n  }\n}\n\nfragment BotHeader_bot on Bot {\n  displayName\n  ...BotImage_bot\n}\n\nfragment BotImage_bot on Bot {\n  profilePicture\n  displayName\n}\n\nfragment BotLink_bot on Bot {\n  displayName\n}\n\nfragment ChatPageBotSwitcher_viewer on Viewer {\n  availableBots {\n    id\n    ...BotLink_bot\n    ...BotHeader_bot\n  }\n}\n'
                    }
                ]
            },
            query: 'mutation subscriptionsMutation(\n  $subscriptions: [AutoSubscriptionQuery!]!\n) {\n  autoSubscribe(subscriptions: $subscriptions) {\n    viewer {\n      id\n    }\n  }\n}\n'
        };

        await this.makeRequest(query);
    }

    public async makeRequest(request) {
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
            const status = await this.sendVerifCode(null, email);
            spinner.start("Waiting for OTP code...");
            const otp_code = await mail.getPoeOTPCode(sid_token);
            spinner.stop();
            if (status === 'user_with_confirmed_email_not_found') {
                await this.signUpWithVerificationCode(null, email, otp_code)
            } else {
                await this.signInOrUp(null, email, otp_code)
            }
        } else {
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
                process.exit(0);
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
        }

        await this.setChatIds();
    }

    public async signInOrUp(phoneNumber, email, verifyCode) {
        console.log("Signing in/up...")
        console.log("Phone number: " + phoneNumber)
        console.log("Email: " + email)
        console.log("Verification code: " + verifyCode)
        try {
            const {
                data: {
                    loginWithVerificationCode: {status: loginStatus},
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

    public async signUpWithVerificationCode(phoneNumber, email, verifyCode) {
        console.log("Signing in/up...")
        console.log("Phone number: " + phoneNumber)
        console.log("Email: " + email)
        console.log("Verification code: " + verifyCode)
        try {
            const {
                data: {
                    signupWithVerificationCode: {status: loginStatus},
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

    public async sendVerifCode(phoneNumber, email) {
        try {
            // status error case: success, user_with_confirmed_phone_number_not_found, user_with_confirmed_email_not_found
            const {data: {sendVerificationCode: {status}}} = await this.makeRequest({
                query: `${queries.sendVerificationCodeMutation}`,
                variables: {
                    emailAddress: email,
                    phoneNumber: phoneNumber
                },
            });
            console.log("Verification code sent. Status: " + status)
            return status;
        } catch (e) {
            console.log("Error sending verification code, please try again " + e)
            await this.resetConfig();
        }
    }

    public async resetConfig() {
        const defaultConfig = JSON.parse(readFileSync("config.example.json", "utf8"));
        console.log("Resetting config...")
        writeFile("config.json", JSON.stringify(defaultConfig, null, 4), function (err) {
            if (err) {
                console.log(err);
            }
        });
    }

    public async getChatId(bot: string) {
        try {
            const {data: {chatOfBot: {chatId}}} = await this.makeRequest({
                query: `${queries.chatViewQuery}`,
                variables: {
                    bot,
                },
            });
            this.chatId = chatId;
            this.bot = bot;
            return chatId;
        } catch (e) {
            console.log(e)
            await this.resetConfig();
            throw new Error("Could not get chat id, invalid formkey or cookie! Please remove the quora_formkey value from the config.json file and try again.");
        }
    }

    public async clearContext(bot: string) {
        try {
            const data = await this.makeRequest({
                query: `${queries.addMessageBreakMutation}`,
                variables: {chatId: this.config.chat_ids[bot]},
            });

            if (!data.data) {
                this.reConnectWs = true; // for websocket purpose
                console.log("ON TRY! Could not clear context! Trying to reLogin..");
                await this.reLogin();
                await this.clearContext(bot);
            }
            return data
        } catch (e) {
            this.reConnectWs = true; // for websocket purpose
            console.log("ON CATCH! Could not clear context! Trying to reLogin..");
            await this.reLogin();
            await this.clearContext(bot);
            return e
        }
    }

    public async sendMsg(bot: string, query: string) {
        try {
            const data = await this.makeRequest({
                query: `${queries.addHumanMessageMutation}`,
                variables: {
                    bot: bot,
                    chatId: this.config.chat_ids[bot],
                    query: query,
                    source: null,
                    withChatBreak: false
                },
            });

            if (!data.data) {
                this.reConnectWs = true; // for cli websocket purpose
                console.log("Could not send message! Trying to reLogin..");
                await this.reLogin();
                await this.sendMsg(bot, query);
            }
            return data
        } catch (e) {
            this.reConnectWs = true; // for cli websocket purpose
            console.log("ON CATCH! Could not send message! Trying to reLogin..");
            await this.reLogin();
            await this.sendMsg(bot, query);
            return e
        }
    }

    public async getHistory(bot: string): Promise<any> {
          try {
            let response = await this.makeRequest({
                query: `${queries.chatPaginationQuery}`,
                variables: {
                    before: null,
                    bot: bot,
                    last: 25,
                },
            });

            return response.data.chatOfBot.messagesConnection.edges
              .map((({node: {messageId, text, authorNickname}}) => ({
                messageId,
                text,
                authorNickname
              })))

        } catch(e) {
            console.log("There has been an error while fetching your history!")
        }
    }

    public async deleteMessages(msgIds: number[]) {
      await this.makeRequest({
        queryName: 'MessageDeleteConfirmationModal_deleteMessageMutation_Mutation',
        variables: {
          messageIds: msgIds
        },
        query: `mutation MessageDeleteConfirmationModal_deleteMessageMutation_Mutation(\n  $messageIds: [BigInt!]!\n){\n  messagesDelete(messageIds: $messageIds) {\n    edgeIds\n  }\n}\n`
      })
    }

    public async getResponse(bot: string): Promise<any> {
        let text: string
        let state: string
        let authorNickname: string
        try {
            while (true) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                let response = await this.makeRequest({
                    query: `${queries.chatPaginationQuery}`,
                    variables: {
                        before: null,
                        bot: bot,
                        last: 1,
                    },
                });
                let base = response.data.chatOfBot.messagesConnection.edges
                let lastEdgeIndex = base.length - 1;
                text = base[lastEdgeIndex].node.text;
                authorNickname = base[lastEdgeIndex].node.authorNickname;
                state = base[lastEdgeIndex].node.state;
                if (state === "complete" && authorNickname === bot) {
                    break;
                }
            }
        } catch (e) {
            console.log("Could not get response!");
            return {
                status: false,
                message: "failed",
                data: null,
            };
        }

        return {
            status: true,
            message: "success",
            data: text,
        };
    }

    public async reLogin() {
        await this.setCredentials();
        if (!this.config.email || !this.config.sid_token) {
            console.log("No email or sid_token found, creating new email and sid_token..")
            const {email, sid_token} = await mail.createNewEmail()
            this.config.email = email;
            this.config.sid_token = sid_token;
        }
        const status = await this.sendVerifCode(null, this.config.email);
        spinner.start("Waiting for OTP code...");
        const otp_code = await mail.getPoeOTPCode(this.config.sid_token);
        spinner.stop();
        if (status === 'user_with_confirmed_email_not_found') {
            await this.signUpWithVerificationCode(null, this.config.email, otp_code)
        } else {
            await this.signInOrUp(null, this.config.email, otp_code)
        }
        const newConfig = JSON.parse(readFileSync("config.json", "utf8"));
        this.config = newConfig;
        this.headers["poe-formkey"] = newConfig.quora_formkey;
        this.headers["poe-tchannel"] = newConfig.channel_name;
        this.headers["Cookie"] = newConfig.quora_cookie;
        await this.setChatIds();
    }

    public async startCli() {
        const isFormkeyAvailable = await this.getCredentials();
        if (!isFormkeyAvailable) {
            const {mode} = await prompts({
                type: "select",
                name: "mode",
                message: "Select",
                choices: [
                    {title: "Auto [This will use temp email to get Verification Code]", value: "auto"},
                    {title: "Semi-Auto [Use you own email/phone number]", value: "semi"},
                    {title: "exit", value: "exit"}
                ],
            });

            if (mode === "exit") {
                process.exit(0);
            }

            await this.setCredentials();
            await this.subscribe();
            await this.login(mode);
        }

        let ws :any;
        if (this.config.stream_response) {
            await getUpdatedSettings(this.config.channel_name, this.config.quora_cookie);
            await this.subscribe();
            ws = await connectWs();
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

        this.chatId = this.config.chat_ids[bot];
        this.bot = bot;

        let helpMsg = "Available commands: !help !exit, !clear, !submit" +
            "\n!help - show this message" +
            "\n!exit - exit the chat" +
            "\n!history - get the last 25 messages" +
            "\n!delete - delete messages" +
            "\n!file - load text from a file" +
            "\n!clear - clear chat history" +
            "\n!submit - submit prompt";

        // await this.clearContext(this.chatId);
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
                    process.exit(0);
                } else if (prompt === "!clear") {
                    spinner.start("Clearing chat history...");
                    await this.clearContext(bot);
                    if (this.config.stream_response) {
                        if (this.reConnectWs) {
                            await disconnectWs(ws);
                            await getUpdatedSettings(this.config.channel_name, this.config.quora_cookie)
                            await this.subscribe();
                            ws = await connectWs();
                            this.reConnectWs = false;
                        }
                    }
                    submitedPrompt = "";
                    spinner.stop();
                    console.log("Chat history cleared");
                } else if (prompt === "!submit") {
                    if (submitedPrompt.length === 0) {
                        console.log("No prompt to submit");
                        continue;
                    }
                    await this.sendMsg(this.bot, submitedPrompt);
                    if (this.config.stream_response) {
                        if (this.reConnectWs) {
                            await disconnectWs(ws);
                            await getUpdatedSettings(this.config.channel_name, this.config.quora_cookie)
                            await this.subscribe();
                            ws = await connectWs();
                            this.reConnectWs = false;
                        }
                        process.stdout.write("Response: ");
                        await listenWs(ws);
                        console.log('\n');
                    } else {
                        spinner.start("Waiting for response...");
                        let response = await this.getResponse(this.bot);
                        spinner.stop();
                        console.log(response.data);
                    }
                    submitedPrompt = "";
                } else if(prompt === "!history") {
                    spinner.start("Loading history...")
                    const msgs = await this.getHistory(this.bot)
                    spinner.stop()
                    for(const { messageId, text, authorNickname } of msgs) {
                        console.log(
                          `${authorNickname === 'human' ? '\x1b[37m%s\x1b[0m' : '\x1b[32m%s\x1b[0m'}`,
                          `${authorNickname === 'human' ? 'You' : 'Bot'}: ${text}\n`
                        )
                    }
                } else if(prompt === "!file") {
                    const { path } = await prompts({
                        type: "text",
                        name: "path",
                        message: "Full path",
                        initial: "/home/user/folder/file",
                        validate: (fp: string) => {
                            if(existsSync(fp)) {
                                const stats = statSync(fp)
                                if(stats.isFile())
                                    return (stats.size < 15e3) ? true : "The maximum allowed size is 15kb"
                            }
                            return `${fp} is not a valid file path`
                        }
                    })
                    submitedPrompt += readFileSync(path)
                } else if(prompt === "!delete") {
                    spinner.start("Loading history...")
                    const msgs = await this.getHistory(this.bot)
                    spinner.stop()

                    const { messageIds } = await prompts({
                        type: "multiselect",
                        name: "messageIds",
                        message: "Delete",
                        choices: msgs.map(msg => ({
                            title: `${(msg.authorNickname === 'human') ? 'You': 'Bot'}: ${msg.text.slice(0, 30)}...`,
                            value: msg.messageId
                        }))
                    })

                    spinner.start("Deleting messages")
                    await this.deleteMessages(messageIds)
                    spinner.stop()

                } else {
                    submitedPrompt += prompt + "\n";
                }
            }
        }
    }
}

export default ChatBot;
