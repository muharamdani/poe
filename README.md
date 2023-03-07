# Quora Poe
This is a CLI tool to call the Quora Poe API through GraphQL. It is a work in progress, and currently supports the following:
- Auto login using temporary email, so you don't need to use your own email/phone number.
- Semi auto login using your own email/phone number, you need to enter the OTP manually.
- Manually login using formkey and cookie, set in the .env file on FORMKEY and COOKIE.
- Chat with 4 types of bots (Sage, Claude, ChatGPT, and Dragonfly).
- Clear the chat history.

## Installation
- Copy the .env.example file to .env and fill in the required fields
- Copy the config.example.json file to config.json
- Run the following command to install the dependencies:

```
npm install
```

## Usage

To start, run:

```
npm start
```

## Requirements

[Only for manual login]
To use this API, you will need to have the following:
- Quora-Formkey: This is obtained by **logging in** to quora.com, and open https://www.quora.com/poe_api/settings, copy the value of the formkey field.
- Cookie: 'm-b=xxxx' - This is the value of the cookie with the key m-b, which is present in the list of cookies used on quora.com, you can simply inspect cookies in Chrome, open chrome dev tools-->Application tab-->Open Cookies dropdwon .
- Put the above two in a .env file in the root directory of the project

Note: Next plan is to add stream support, so you can get tha chat responses in real time.

## Contributing

To contribute to this repo, fork first and create a pull request.
