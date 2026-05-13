
# RedditFarmValleyMergeGiveaway

<img width="312" height="279" alt="image" src="https://github.com/user-attachments/assets/67ab2304-5e6a-4cb0-abab-b3ca0bf0df07" />

Adds a popup to Reddit to show new giveaways for the game Farm Valley Merge and lets the user exclude giveaways that aren't needed.

**Features:**

**Smart Tracking:** Automatically categorizes raffles as New, Entered, Finished, or Won.

**Quick Navigation:** Navigation shortcuts at the top of the popup to jump instantly to the oldest new raffle or the most recent expired one.

**Collection Management:** Use the "Got It" button to hide stickers you no longer need. These are kept in a "Collected" area where they can be reactivated with a single click.

**Crowdsourced Winner Data:** If a raffle is expired, the script checks if a winner has been recorded. If not, clicking "Save" on the raffle page extracts the winner data and shares it with all other users.

**Detailed Analytics:** An info modal shows the raffle author, the winner, and exactly how many days/hours/minutes have passed since the raffle closed.

**Integrated Copy Tools:** Quickly copy usernames to your clipboard to facilitate prize claims or communication.

**Alternative Webpage:** If you aren't confident to use a userscript, or are playing on your phone you can find a web version at https://fvm.itamer.com/stickers.html

**How Farm Merge Valley raffles work**

* a user earns a sticker by playing the game, if they already have the sticker they may be prompted to raffle the duplicate and earn bonus star vault points. The raffle will run for 24 hours and the user won't be prompted to start another until this one ends.
* To enter a raffle users must search for raffles that are less than 24 hours old, open the post and click enter. The game needs to fully load for the entry to be valid.
* At the end of the raffle the user must return to the raffle to "reveal" the winner. The next time they open the game the sticker will be awarded to them. You have a limited period of time (7 days?) to check a raffle and claim your sticker.

**How this script helps**

* faster to find open raffles for the stickers you need
* easy to exclude raffles for stickers you already have, or are happy to earn through the game (eg 1 star stickers)
* no need to record which raffles you have entered, the popup will take you back to them
* no need to visit a raffle you've entered if the winner has been recorded by another player and someone else won.

**What it doesn't do**

* it doesn't actually enter you into the raffle, you still need to click enter.
* it doesn't claim your sticker, you still need to click reveal.

**Installation**

Before adding the script make sure your desktop/laptop browser has an extension called either GreaseMonkey or TamperMonkey. They may require you to turn developer mode on. Read the instructions provided by the extension.

Once installed click this link: https://github.com/sarahk/RedditFarmValleyMergeGiveaway/raw/refs/heads/main/RedditFarmValleyMergeGiveaway.user.js

The script does save data offsite but it's very basic and virtually anonymous.

When you first use it you will be asked if you want to use the script. The message is intimidating but you're safe. 

**A userscript wants to access a cross-origin resource.**


<img width="250" height="77" alt="tampermonkey permissions" src="https://github.com/user-attachments/assets/4c8e653d-735e-4fed-a75e-ad4d1def0252" />

Choose "Always Allow"

This script is still experimental. Let me know if anything breaks or if you have suggestions.

**Frequently Asked Questions**

Some users report having trouble saving their username. If you are having problems please get in touch - there's a chat button at the bottom of the popup. Old Reddit and New Reddit will both ask you for your username, this is normal behaviour that I can't get around. New Reddit is the login name that matters.

**Firefox** - a few known issues that I haven't had time to resolve. Chrome, Safari, and Brave behave normally.

**TamperMonkey/GreaseMonkey and Developer Mode**

TM/GM require that your browser has developer mode turned on for ALL extensions. That should be fine for most browser extensions but may open you up to security risks. 

<img width="436" height="232" alt="image" src="https://github.com/user-attachments/assets/df4f4607-eb98-42f5-8c6e-4fdc9a906e43" />

If you find you still get a warning message about needing to turn developer mode on open up TM/GM from the browser extension list. There will be a bunch of options and settings. Check these two.

<img width="640" height="171" alt="image" src="https://github.com/user-attachments/assets/ddb308c7-99bf-4010-bd41-d609d78798d1" />

**Open 10**

Both the userscript and the webpage allow you to open 10 raffles at a time to speed up the entering process - you still have to click enter and let the game load. The tabs that open are treated as **popups**. Most browsers will block popups by default. Take a moment to find out how your browser manages popups and enable them either for sh.reddit.com (userscript) or fvm.itamer.com (webpage).

**If you're still having problems please let me know.**


