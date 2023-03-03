# Quora Poe

- Since it 

## Installation

To install this app, run:

```
npm install
```

## Usage

To start, run:

```
npm start
```

## Requirements

To use this API, you will need to have the following cookies:
- Quora-Formkey: This is obtained by logging in to Quora.com, viewing the page source, and finding the "formkey" dictionary key. Use its value in the Quora-Formkey field.
- Cookie: 'm-b=xxxx' - This is the value of the cookie with the key m-b, which is present in the list of cookies used on Quora.com, you can simply inspect cookies in Chrome to get it.
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
