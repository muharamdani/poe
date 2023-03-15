import fetch from "cross-fetch";
import prompts from "prompts";
import ora from "ora";
import * as dotenv from "dotenv";
import { readFileSync, writeFile } from "fs";
import { scrape, getUpdatedSettings } from "./credential.js";
import { listenWs, connectWs, disconnectWs } from "./websocket.js";
import * as mail from "./mail.js";

dotenv.config();

const spinner = ora({
  color: "cyan",
});

const gqlDir = process.cwd() + "/graphql";

const queries = {
  chatViewQuery: readFileSync(gqlDir + "/ChatViewQuery.graphql", "utf8"),
  addMessageBreakMutation: readFileSync(
    gqlDir + "/AddMessageBreakMutation.graphql",
    "utf8"
  ),
  chatPaginationQuery: readFileSync(
    gqlDir + "/ChatPaginationQuery.graphql",
    "utf8"
  ),
  addHumanMessageMutation: readFileSync(
    gqlDir + "/AddHumanMessageMutation.graphql",
    "utf8"
  ),
  loginMutation: readFileSync(
    gqlDir + "/LoginWithVerificationCodeMutation.graphql",
    "utf8"
  ),
  signUpWithVerificationCodeMutation: readFileSync(
    gqlDir + "/SignupWithVerificationCodeMutation.graphql",
    "utf8"
  ),
  sendVerificationCodeMutation: readFileSync(
    gqlDir + "/SendVerificationCodeForLoginMutation.graphql",
    "utf8"
  ),
};

let [pbCookie, channelName, appSettings, formkey] = ["", "", "", ""];

export default class ChatBot {
  private headers = {
    "Content-Type": "application/json",
    Accept: "*/*",
    Host: "poe.com",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    Origin: "https://poe.com",
  };

  private chatId: number = 0;
  private bot: string = "";
  private ws: any;
  private credentials: {
    quora_formkey: string;
    quora_cookie: string;
    channel_name: string;
    app_settings: any;
  };

  private async getCredentials() {
    const credentials = JSON.parse(readFileSync("config.json", "utf8"));
    const { quora_formkey, quora_cookie } = credentials;
    if (quora_formkey.length > 0 && quora_cookie.length > 0) {
      formkey = quora_formkey;
      pbCookie = quora_cookie;
      // For websocket later feature
      channelName = credentials.channel_name;
      appSettings = credentials.app_settings;
      this.headers["poe-formkey"] = formkey;
      this.headers["poe-tchannel"] = channelName;
      this.headers["Cookie"] = pbCookie;
    }
    return quora_formkey.length > 0 && quora_cookie.length > 0;
  }

  private async setCredentials() {
    let result = await scrape();
    this.credentials.quora_formkey = result.appSettings.formkey;
    this.credentials.quora_cookie = result.pbCookie;
    // For websocket later feature
    this.credentials.channel_name = result.channelName;
    this.credentials.app_settings = result.appSettings;

    // set value
    formkey = result.appSettings.formkey;
    pbCookie = result.pbCookie;
    // For websocket later feature
    channelName = result.channelName;
    appSettings = result.appSettings;
    this.headers["poe-formkey"] = formkey;
    this.headers["poe-tchannel"] = channelName;
    this.headers["Cookie"] = pbCookie;
  }

  private async subscribe() {
    const query = {
      queryName: "subscriptionsMutation",
      variables: {
        subscriptions: [
          {
            subscriptionName: "messageAdded",
            query:
              "subscription subscriptions_messageAdded_Subscription(\n  $chatId: BigInt!\n) {\n  messageAdded(chatId: $chatId) {\n    id\n    messageId\n    creationTime\n    state\n    ...ChatMessage_message\n    ...chatHelpers_isBotMessage\n  }\n}\n\nfragment ChatMessageDownvotedButton_message on Message {\n  ...MessageFeedbackReasonModal_message\n  ...MessageFeedbackOtherModal_message\n}\n\nfragment ChatMessageDropdownMenu_message on Message {\n  id\n  messageId\n  vote\n  text\n  ...chatHelpers_isBotMessage\n}\n\nfragment ChatMessageFeedbackButtons_message on Message {\n  id\n  messageId\n  vote\n  voteReason\n  ...ChatMessageDownvotedButton_message\n}\n\nfragment ChatMessageOverflowButton_message on Message {\n  text\n  ...ChatMessageDropdownMenu_message\n  ...chatHelpers_isBotMessage\n}\n\nfragment ChatMessageSuggestedReplies_SuggestedReplyButton_message on Message {\n  messageId\n}\n\nfragment ChatMessageSuggestedReplies_message on Message {\n  suggestedReplies\n  ...ChatMessageSuggestedReplies_SuggestedReplyButton_message\n}\n\nfragment ChatMessage_message on Message {\n  id\n  messageId\n  text\n  author\n  linkifiedText\n  state\n  ...ChatMessageSuggestedReplies_message\n  ...ChatMessageFeedbackButtons_message\n  ...ChatMessageOverflowButton_message\n  ...chatHelpers_isHumanMessage\n  ...chatHelpers_isBotMessage\n  ...chatHelpers_isChatBreak\n  ...chatHelpers_useTimeoutLevel\n  ...MarkdownLinkInner_message\n}\n\nfragment MarkdownLinkInner_message on Message {\n  messageId\n}\n\nfragment MessageFeedbackOtherModal_message on Message {\n  id\n  messageId\n}\n\nfragment MessageFeedbackReasonModal_message on Message {\n  id\n  messageId\n}\n\nfragment chatHelpers_isBotMessage on Message {\n  ...chatHelpers_isHumanMessage\n  ...chatHelpers_isChatBreak\n}\n\nfragment chatHelpers_isChatBreak on Message {\n  author\n}\n\nfragment chatHelpers_isHumanMessage on Message {\n  author\n}\n\nfragment chatHelpers_useTimeoutLevel on Message {\n  id\n  state\n  text\n  messageId\n}\n",
          },
          {
            subscriptionName: "viewerStateUpdated",
            query:
              "subscription subscriptions_viewerStateUpdated_Subscription {\n  viewerStateUpdated {\n    id\n    ...ChatPageBotSwitcher_viewer\n  }\n}\n\nfragment BotHeader_bot on Bot {\n  displayName\n  ...BotImage_bot\n}\n\nfragment BotImage_bot on Bot {\n  profilePicture\n  displayName\n}\n\nfragment BotLink_bot on Bot {\n  displayName\n}\n\nfragment ChatPageBotSwitcher_viewer on Viewer {\n  availableBots {\n    id\n    ...BotLink_bot\n    ...BotHeader_bot\n  }\n}\n",
          },
        ],
      },
      query:
        "mutation subscriptionsMutation(\n  $subscriptions: [AutoSubscriptionQuery!]!\n) {\n  autoSubscribe(subscriptions: $subscriptions) {\n    viewer {\n      id\n    }\n  }\n}\n",
    };

    await this.makeRequest(query);
  }

  public async start(mode: "auto" | "semi" = "auto") {
    await this.setCredentials();
    await this.subscribe();
    await this.login(mode);
    await getUpdatedSettings(channelName, pbCookie);
    await this.subscribe();
    this.ws = await connectWs();
  }
  public async send(
    prompt: string,
    model: "a2" | "capybara" | "nutria" | "chinchilla"
  ) {
    const isFormkeyAvailable = await this.getCredentials();
    if (!isFormkeyAvailable) {
      throw new Error("Need to start the bot first");
    }
    await this.getChatId(model);

    await this.clearContext();
    let submitedPrompt = "";

    await this.sendMsg(prompt);
    process.stdout.write("Response: ");
    await listenWs(this.ws);
    console.log("\n");
    submitedPrompt = "";
  }

  private async makeRequest(request) {
    this.headers["Content-Length"] = Buffer.byteLength(
      JSON.stringify(request),
      "utf8"
    );

    const response = await fetch("https://poe.com/api/gql_POST", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });

    return await response.json();
  }

  public async login(mode: string) {
    if (mode === "auto") {
      const { email, sid_token } = await mail.createNewEmail();
      const status = await this.sendVerifCode(null, email);
      spinner.start("Waiting for OTP code...");
      const otp_code = await mail.getPoeOTPCode(sid_token);
      spinner.stop();
      if (status === "user_with_confirmed_email_not_found") {
        await this.signUpWithVerificationCode(null, email, otp_code);
      } else {
        await this.signInOrUp(null, email, otp_code);
      }
    } else {
      const { type } = await prompts({
        type: "select",
        name: "type",
        message: "Select",
        choices: [
          { title: "Email", value: "email" },
          { title: "Phone number", value: "phone" },
          { title: "exit", value: "exit" },
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
      let status = "";
      if (type === "email") {
        status = await this.sendVerifCode(null, credentials);
      } else {
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
          if (status === "user_with_confirmed_email_not_found") {
            loginStatus = await this.signUpWithVerificationCode(
              null,
              credentials,
              verifyCode
            );
          } else {
            loginStatus = await this.signInOrUp(null, credentials, verifyCode);
          }
        } else if (type === "phone") {
          if (status === "user_with_confirmed_phone_number_not_found") {
            loginStatus = await this.signUpWithVerificationCode(
              credentials,
              null,
              verifyCode
            );
          } else {
            loginStatus = await this.signInOrUp(credentials, null, verifyCode);
          }
        }
      }
      spinner.stop();
    }
  }

  private async signInOrUp(phoneNumber, email, verifyCode) {
    console.log("Signing in/up...");
    console.log("Phone number: " + phoneNumber);
    console.log("Email: " + email);
    console.log("Verification code: " + verifyCode);
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
          phoneNumber: phoneNumber,
        },
      });
      console.log("Login Status: " + loginStatus);
      return loginStatus;
    } catch (e) {
      throw e;
    }
  }

  private async signUpWithVerificationCode(phoneNumber, email, verifyCode) {
    console.log("Signing in/up...");
    console.log("Phone number: " + phoneNumber);
    console.log("Email: " + email);
    console.log("Verification code: " + verifyCode);
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
          phoneNumber: phoneNumber,
        },
      });
      console.log("Login Status: " + loginStatus);
      return loginStatus;
    } catch (e) {
      throw e;
    }
  }

  private async sendVerifCode(phoneNumber, email) {
    try {
      // status error case: success, user_with_confirmed_phone_number_not_found, user_with_confirmed_email_not_found
      const {
        data: {
          sendVerificationCode: { status },
        },
      } = await this.makeRequest({
        query: `${queries.sendVerificationCodeMutation}`,
        variables: {
          emailAddress: email,
          phoneNumber: phoneNumber,
        },
      });
      console.log("Verification code sent. Status: " + status);
      return status;
    } catch (e) {
      throw e;
    }
  }

  private async getChatId(bot: string) {
    try {
      const {
        data: {
          chatOfBot: { chatId },
        },
      } = await this.makeRequest({
        query: `${queries.chatViewQuery}`,
        variables: {
          bot,
        },
      });
      this.chatId = chatId;
      this.bot = bot;
    } catch (e) {
      throw new Error(
        "Could not get chat id, invalid formkey or cookie! Please remove the quora_formkey value from the config.json file and try again."
      );
    }
  }

  private async clearContext() {
    try {
      await this.makeRequest({
        query: `${queries.addMessageBreakMutation}`,
        variables: { chatId: this.chatId },
      });
    } catch (e) {
      throw new Error("Could not clear context");
    }
  }

  private async sendMsg(query: string) {
    try {
      await this.makeRequest({
        query: `${queries.addHumanMessageMutation}`,
        variables: {
          bot: this.bot,
          chatId: this.chatId,
          query: query,
          source: null,
          withChatBreak: false,
        },
      });
    } catch (e) {
      throw new Error("Could not send message");
    }
  }

  // Responce without stream
  private async getResponse(): Promise<string> {
    let text: string;
    let state: string;
    let authorNickname: string;
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
