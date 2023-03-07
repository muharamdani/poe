# Quora Poe
This is a CLI tool to call the Quora Poe API through GraphQL. It is a work in progress, and currently supports the following:
- Auto login using temporary email, so you don't need to use your own email/phone number.
- Semi auto login using your own email/phone number, you need to enter the OTP manually.
- Chat with 4 types of bots (Sage, Claude, ChatGPT, and Dragonfly).
- Clear the chat history.

## Requirements
- NodeJS 16.0.0 or higher
- NPM

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

## TODO List
- [ ] Add support for relogin after session expires
- [ ] Add stream support

## Contributing

To contribute to this repo, fork first and create a pull request.
