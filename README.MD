# Cesium Demo

![cesium_guess_location.png](cesium_guess_location.png)

This demo shows a world with people taken from the `people.json` and images taken from `public` folder. It's using [Cesium](https://cesium.com) for the map and rendering.

![guesser.gif](guesser.gif)

# Pre-requisited

## Create a Slack app

1. Get a Slack API Token
Create a Slack app at https://api.slack.com/apps.
2. Add the users:read and users:read.email scopes.
3. Install the app to your workspace and get the OAuth token. Copy it in the `.env` file.

Run the `scripts/read_people_slack.py` script to generate the `public/people` images and the `people.json` file. Review the images and people to make sure there isn't any wrong/bot in the result. Also you may want to manually update the `tz` property to the correct location.

```sh
pip3 install python-dotenv --break-system-packages
python3 scripts/read_people_slack.py
```

Go through the `people.json` and add in the `countries.json` if there are any countries missing. You can use AI here, eg.:

```
Promot:
<Copy paste the people.json>

Add the countires from tz to this file, countries.json


```

How to run locally:

```sh
npm install http-server -g
http-server .
```