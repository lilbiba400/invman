# INVMAN
Simple CLI-Based inventory manager for CS2 using [node-globaloffensive](https://github.com/DoctorMcKay/node-globaloffensive) and [node-steamuser](https://github.com/DoctorMcKay/node-steam-user)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/L4L41II3YS)
or
[send me some of the junk from the depths of your Storageunits](https://lilbiba400.github.io/invman-donations):

## Install
Download and install the invman_setup.exe from the releases tab.

Invman can also be used without installation. To do so, clone the repo, go into the invman/ directory. From there you can start INVMAN using:

    node main.js

**Attention!**: This will create a accounts/ folder at the current location which will contain the savefiles for your accounts!

## Usage
After installation, start **INVMAN** and proceed with one of the supported login methods (*either QR-Login using the Steam Mobile App or credentials*)



https://github.com/user-attachments/assets/42049d95-0210-4305-bef6-b28c7fe4b4ca



## Features

- List items in Inventory and Storageunits
- Move items in and out of Storageunits (add/remove commands)
- Search for items (find command)
- Create Steam-Multisell links for generic items (sell command)
- Save credentials for multiple accounts
- Context sensitive autocompletion (start typing and press tab)
- Use the **help** command to get a list of available commands
- Parsing Containers, Agents and most regular Skins. (*Patches, Stickers and Graffitis are not yet supported.*)
- Detailed information about skins, like full float, paint seed, etc. (inspect command)
- Coloring items by their rarity
- Parsing Stickers

### Roadmap
- Price fetching and inventory evaluation
- Trade items between saved accounts
- Parsing Patches and Graffitis


## Build
To build from source, clone the repo and go into the **invman/** directory. From there run:

        npm install
        pkg .

The finished executable can be found in **invman/dist/**.
To Build for different targets(e.g. Linux or MacOS) you can add the desired targets to **package.json>pkg>targets**

Note: *The installer was built using [Inno Setup](https://jrsoftware.org/isinfo.php)*
