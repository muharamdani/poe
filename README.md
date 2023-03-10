# Quora Poe
This is a CLI tool to call the Quora Poe API through GraphQL. It is a work in progress, and currently supports the following:
- Auto login using temporary email, so you don't need to use your own email/phone number.
- Semi auto login using your own email/phone number, you need to enter the OTP manually.
- Chat with 4 types of bots (Sage, Claude, ChatGPT, and Dragonfly).
- Stream responses support from the bot.
- Clear the chat history.

## Requirements
- NodeJS 16.0.0 or higher
- NPM

## Installation
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

## TODO List
- [ ] Make it modular, so it can be used as a library
- [ ] Add support for re-login after session expires
- [ ] Add support for get chat history
- [ ] Add support for delete message

## Contributing

To contribute to this repo, fork first and create a pull request.
