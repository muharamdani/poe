# Quora Poe
This is a CLI tool to call the Quora Poe API through GraphQL. It is a work in progress, and currently only supports the following:
- Chat with 4 types of bots (Sage, Claude, ChatGPT, and Dragonfly)
- Clear the chat history

## Installation
- Copy the .env.example file to .env and fill in the required fields
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

To use this API, you will need to have the following:
- Quora-Formkey: This is obtained by logging in to Quora.com, viewing the page source, and finding the "formkey" dictionary key.
- Cookie: 'm-b=xxxx' - This is the value of the cookie with the key m-b, which is present in the list of cookies used on Quora.com, you can simply inspect cookies in Chrome to get it.
- Put the above two in a .env file in the root directory of the project

Note: Next plan is to semi automate this things

## Dependencies
- @apollo/client
- @apollo/server
- chalk
- cheerio
- cli-spinners
- cross-fetch
- fetch-cookie
- graphql
- graphql-tag
- ora
- prompts

## Contributing

To contribute to this repo, fork first and create a pull request.
