import {ApolloClient, InMemoryCache, gql} from "@apollo/client/core/core.cjs";
import {HttpLink} from "@apollo/client/link/http/http.cjs";
import makeSession from "fetch-cookie";
import fetch from "cross-fetch";
import prompts from "prompts";
import ora from "ora";
import * as dotenv from "dotenv";
import {readFileSync} from "fs";

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
};

class ChatBot {
    private baseURL: string = "https://www.quora.com";
    private session: any = makeSession(fetch);
    private client: any = new ApolloClient({
        link: new HttpLink({
            fetch: this.session,
            uri: `${this.baseURL}/poe_api/gql_POST`,
            headers: {
                "Host": "www.quora.com",
                "Accept": "*/*",
                "apollographql-client-version": "1.1.6-65",
                "Accept-Language": "en-US,en;q=0.9",
                "User-Agent": "Poe 1.1.6 rv:65 env:prod (iPhone14,2; iOS 16.2; en_US)",
                "apollographql-client-name": "com.quora.app.Experts-apollo-ios",
                "Connection": "keep-alive",
                "Content-Type": "application/json",
                "Quora-Formkey": process.env.QUORA_FORMKEY || "",
                "Cookie": process.env.MB_COOKIE || "",
            },
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

    private chatId: number = 0;
    private bot: string = "";

    public async start() {
        const {bot} = await prompts({
            type: "select",
            name: "bot",
            message: "Select",
            choices: [
                {title: "Claude (Powered by Anthropic)", value: "a2"},
                {title: "Sage (Powered by OpenAI - logical)", value: "capybara"},
                {title: "Dragonfly (Powered by OpenAI - simpler)", value: "nutria"},
                {title: "ChatGPT (Powered by OpenAI - current)", value: "chinchilla"},
                {title: "exit", value: "exit"}
            ],
        });

        if (bot === "exit") {
            return;
        }

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
