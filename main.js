const SteamUser = require('steam-user')
const GlobalOffensive = require('globaloffensive')
const fs =require('fs')
const cliProgress = require('cli-progress')
const readline = require('readline');
const {LoginSession,EAuthTokenPlatformType} = require('steam-session');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

//set working dir to script dir
//process.chdir(__dirname)

const user  = new SteamUser()
const csgo = new GlobalOffensive(user)
let REFRESH_TOKEN;
let rl = null;
const REFRESH_TOKEN_PATH = 'accounts/';

//Inventory contents
let inventory //aggregated once connected to GC
let parsedInv //aggregated when calling parseInv()
let casketsLoaded=0 //sets the amount of loaded caskets to 0

// Autocomplete, aggregated when inventory is loaded and genAutocomplete() is called
let casketSug={}
let inventorySug=[]
let commonSug=[]
const commands={
    add:"add",
    remove:"remove",
    ls:"ls",
    clear:"clear",
    help:"help",
    find:"find",
    account:"account",
    sell:"sell",
    donate:"donate",
    exit:"exit",
    inspect:"inspect"
}

//Data sources
let items_game={}
let itemDb={}

user.on('loggedOn', (details) => { //when logged in to Steam, start Counter Strike 2
    console.log('\nAuthenticated successfully!');
    console.log(`SteamID: ${user.steamID}`);

    user.setPersona(SteamUser.EPersonaState.Online)
    user.gamesPlayed({game_id:730,game_extra_info:"Managing Storageunits with Invman!"})
});

user.on('error', (err) => { //if error occurs, log it
    console.error('Steam user error:', err);
});

user.on('disconnected', (eresult, msg) => { //if disconnected from Steam, log it
    console.warn('Disconnected from Steam:', eresult, msg);
});

user.on('refreshToken', (token) => {
    REFRESH_TOKEN=token
});

csgo.on('disconnectedFromGC', (reason) => { //if disconnected from Game Coordinator, log it
    console.warn('Disconnected from CS:GO Game Coordinator:', reason);
});

csgo.on('connectedToGC', (reason) => {  //when connection to Game Coordinator is established, execute main function
    console.log('Connected to CS:GO Game Coordinator:');
    
    parseInv()
    loadCaskets(main)
});

async function getSources(){
    
    const url = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt';
    const itemDbUrl = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json';

        try{
            const itemDbResponse = await axios.get(itemDbUrl);
            itemDb=Object.values(itemDbResponse.data)
            //fs.writeFileSync("itemDb2.json", JSON.stringify(itemDb,null,2), 'utf8');
        }catch(err){
            console.log(`Couldn't download itemDb.json from ${itemDbUrl}`,err)
        }
        try{
            const response = await axios.get(url);
            const raw = response.data;

            const parsed = parseVDF(raw);

    // Find the "items" block
            let items = null;
            if (parsed.items) {
                items = parsed.items;
            } else if (parsed["items_game"] && parsed["items_game"].items) {
                items = parsed["items_game"].items;
            }

            if (!items) {
                console.error('No "items" block found in the parsed data.');
                process.exit(1);
            }

    // Convert to a single object if it's an array
            let itemsObject = items;
            if (Array.isArray(items)) {
                itemsObject = {};
                items.forEach(chunk => {
                    if (typeof chunk === 'object' && chunk !== null) {
                    Object.assign(itemsObject, chunk);
                    }
                });
            }
            
            items_game=itemsObject
        }catch (err){
            console.error(`Couldn't download items_game.txt from ${url}`,err)
        }
    
}

function parseVDF(text) {
    const lines = text.split(/\r?\n/);
    const stack = [];
    let current = {};
    let key = null;
  
    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;
  
      if (line === '{') {
        const obj = {};
        if (key !== null) {
          if (typeof current[key] === 'undefined') {
            current[key] = obj;
          } else if (Array.isArray(current[key])) {
            current[key].push(obj);
          } else {
            current[key] = [current[key], obj];
          }
        }
        stack.push([current, key]);
        current = obj;
        key = null;
      } else if (line === '}') {
        [current, key] = stack.pop();
        key = null;
      } else {
        // Key-value pair
        const match = line.match(/^"([^"]+)"\s+"([^"]*)"$/);
        if (match) {
          const [, k, v] = match;
          current[k] = v;
        } else {
          // Key without value, expect a block
          const keyMatch = line.match(/^"([^"]+)"$/);
          if (keyMatch) {
            key = keyMatch[1];
          }
        }
      }
    }
    return current;
  }

function saveRefreshToken(token,userName,userId) {

    let accountFile=`${REFRESH_TOKEN_PATH}${userId}.json`
    console.log(accountFile)
    console.log(token)
    fs.writeFileSync(accountFile, JSON.stringify({ refreshToken: token, userName: userName }), 'utf8');
}

function loadRefreshToken() {
    let accounts=fs.readdirSync(REFRESH_TOKEN_PATH)
    let account_tokens={}
    for(let i=0;i<accounts.length;i++){
        let accountFile=REFRESH_TOKEN_PATH+accounts[i]
        let accountId=accountFile.replace(".json","")
        let refreshToken=JSON.parse(fs.readFileSync(accountFile,'utf8'))

        account_tokens[accountId]={name:refreshToken.userName,refreshToken:refreshToken.refreshToken}
    }
    return account_tokens
}

function handleLogin(){ //choose login method
    const savedTokens = loadRefreshToken();
    const inL=readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    if (Object.keys(savedTokens).length) {
        let savedAccounts="\n\nOr use saved credentials:\n"
        for(let i=0;i<Object.keys(savedTokens).length;i++){
            savedAccounts+=`${i+3}. ${savedTokens[Object.keys(savedTokens)[i]].name}\n`
        }

        inL.question(`How do you want to sign into steam?\n1. QR-Code     2. Credentials${savedAccounts}\n>`,choice =>{
            if(choice==1){
                inL.close()
                qrLogin()
            }else if(choice==2){
                console.log("Log in with account credentials")
                let accountName,password;
                inL.question("Username: ",userName =>{
                    accountName=userName
                    inL.question("Password: ",pass => {
                        password=pass
                        inL.close()
                        credLogin(accountName,password)
                    })
                }) 
            }else if(choice>Object.keys(savedTokens).length+2){
                inL.close()
                handleLogin()
            }else{
                inL.close()
                user.logOn({refreshToken:savedTokens[Object.keys(savedTokens)[choice-3]].refreshToken})
            }
        })
    }
    
    inL.question("How do you want to sign into steam?\n1. QR-Code     2. Credentials\n>",choice =>{
        if(choice==1){
            inL.close()
            qrLogin()
        }else if(choice==2){
            console.log("Log in with account credentials")
            let accountName,password;
            inL.question("Username: ",userName =>{
                accountName=userName
                inL.question("Password: ",pass => {
                    password=pass
                    inL.close()
                    credLogin(accountName,password)
                })
            }) 
        }else{
            inL.close()
            handleLogin()
        }
    })
}

function credLogin(userName,pass){ //logs in using account credentials
    user.logOn({
        accountName: userName,
        password: pass
    });
}

async function qrLogin(){ //log in using qr-code session
    try {
        
        let session = new LoginSession(EAuthTokenPlatformType.SteamClient); // You can choose WebBrowser or MobileApp

        session.loginTimeout = 120000;
        
        const startResult = await session.startWithQR();
        const qrCodeUrl = startResult.qrChallengeUrl;

        console.log('Login to Steam using QR-Code:');
        qrcode.generate(qrCodeUrl, { small: true });

        // Event listener for when the QR code is scanned and interaction is detected
        session.on('remoteInteraction', () => {
            console.log('QR-Code has been scanned, waiting for approval.');
        });

        // Event listener for successful authentication
        session.on('authenticated', async () => {
            
            // Now, use the refresh token to log in with node-steamuser
            user.logOn({
                refreshToken: session.refreshToken
            });
            REFRESH_TOKEN=session.refreshToken
        });

        // Event listener for timeout
        session.on('timeout', () => {
            console.error('Login attempt timed out. No approval received within the specified time.');
            
        });

        // Event listener for errors
        session.on('error', (err) => {
            console.error(`ERROR during login session: ${err.message}`);
            
        });



    } catch (error) {
        console.error('Failed to start QR code session:', error.message);
        
    }
}

function initReadline() {
    if (rl) {
        rl.close(); // Close the previous interface if it exists
    }
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (line) => {
            const words = line.trim().split(/\s+/);
            const lastWord = words[words.length - 1] || '';
            let command=words[0]
            

            if (words.length === 1) {
                const hits = Object.values(commands).filter(cmd => cmd.startsWith(lastWord));
                return [hits.length ? hits : Object.values(commands), lastWord];
            }
            
            if (command === commands.add && words.length === 2) {
                const arg = lastWord;
                const subCmds = Object.keys(casketSug);
                const hits = subCmds.filter(s => s.startsWith(`${arg}`));
                return [hits.length ? hits : subCmds, lastWord];
            }
        
            if (command===commands.add && words.length===3){
                const arg = lastWord;
                const subCmds = inventorySug;
                const hits = subCmds.filter(s => s.startsWith(`${arg}`));
                return [hits.length ? hits : subCmds, lastWord];
            }
        
            if (command === commands.remove && words.length === 2) {
                const arg = lastWord;
                const suggestionList = Object.keys(casketSug);
                const hits = suggestionList.filter(s => s.startsWith(`${arg}`));
                return [hits.length ? hits : suggestionList, lastWord];
            }
            if(command === commands.remove && words.length === 3){
                const arg = lastWord;
                const suggestionList = (casketSug[words[1]] || []);
                const hits = suggestionList.filter(s => s.startsWith(`${arg}`));
                return [hits.length ? hits : suggestionList, lastWord];
            }
            if(command===commands.ls && words.length ==2){
                const arg = lastWord;
                const suggestionList = Object.keys(casketSug);
                const hits = suggestionList.filter(s=> s.startsWith(`${arg}`));
                return [hits.length ? hits : suggestionList, lastWord];
            }
            if(command===commands.find && words.length==2){
                const arg = lastWord
                const suggestionList = commonSug
                const hits = suggestionList.filter(s=>s.startsWith(`${arg}`))
                return [hits.length ? hits : suggestionList, lastWord]
            }
            if(command===commands.sell && words.length>=2){
                const arg = lastWord
                const suggestionList=inventorySug
                const hits = suggestionList.filter(s=>s.startsWith(`${arg}`))
                return [hits.length ? hits : suggestionList, lastWord]
            }
            if(command===commands.inspect && words.length==2){
                const arg = lastWord
                let suggestionList = [...inventorySug]
                suggestionList.push(...Object.values(casketSug).flat())
                const hits = suggestionList.filter(s=>s.startsWith(`${arg}`))
                return [hits.length ? hits : suggestionList, lastWord]
            }
            // Default: no matches
            return [[], lastWord];
        }
    });

    rl.on('line', (input) => {
        // --- Parse input: command at index 0, quoted arguments as single strings (without quotes) ---
        // This allows users to input arguments with spaces by wrapping them in quotes, e.g.:
        // add "My Storage Unit" "AK-47 | Redline" 2
        // The result will be: [ 'add', 'My Storage Unit', 'AK-47 | Redline', '2' ]

        let input_array = input.split(" ")
        
        // Convert underscores back to spaces for all arguments except the command itself
        for (let i = 1; i < input_array.length; i++) {
            if (typeof input_array[i] === 'string') {
                input_array[i] = input_array[i].replace(/_/g, ' ');
            }
        }
        // Check if the last entry is a number (amount), and not for the ls command
        let amount;
        let lastEntry = input_array[input_array.length-1];
        if(!isNaN(parseFloat(lastEntry)) && isFinite(lastEntry) && input_array[0]!=commands.ls){
            amount=input_array[input_array.length-1];
            input_array.pop(); // Remove the amount from the array
        }
        // If there are more than 3 elements, merge all arguments from index 2 onwards into a single string (for multi-word item names)
        if(input_array.length>3){
            let item="";
            for(let i=2;i<input_array.length;i++){
                item+=input_array[i]+" ";
            }
            input_array = [input_array[0],input_array[1],item.trim(), amount];
        }
        // Call the appropriate command handler based on the command
        let command=input_array[0]

        switch(command){
            case commands.find:
                findCommand(input_array[1])
                break
            case commands.add:
                moveItemToCasket(input_array[2],input_array[1],amount)
                break
            case commands.remove:
                moveItemFromCasket(input_array[2],input_array[1],amount)
                break
            case commands.ls:
                lsCommand(input_array[1])
                break
            case commands.clear:
                console.clear()
                break
            case commands.help:
                helpMsg(input_array[1])
                break
            case commands.account:
                let steamID64=user.steamID
                let profileUrl=`https://steamcommunity.com/profiles/${steamID64}`
                let hyperlink=`\u001b]8;;${profileUrl}\u0007${profileUrl}\u001b]8;;\u0007`
                console.log(`\nLogged in as ${user.accountInfo.name}:\nSteamID64:       ${steamID64}\nProfile-URL:     ${hyperlink}\nE-Mail:          ${user.emailInfo.address}`)
                break
            case commands.sell:
                sellCommand(input_array)
                break
            case commands.donate:
                donateCommand()
                break
            case commands.exit:
                console.log("Closing INVMAN...")
                process.exit(0)
            case commands.inspect:
                inspectCommand(input_array[1])
                break
            default:
                helpMsg("unknown")
        }
        rl.prompt();
      });

    rl.setPrompt('invman> ');
    rl.prompt();
}

function helpMsg(scope){
    const help="Welcome to invman, the simple CLI inventory manager for CS2. Use 'help <command>' for more info. Supported commands are:"
    switch (scope){
        default:
            printWrappedList(help,Object.values(commands),false)
            break
        case commands.add:
            printWrappedList("Used to add items to a storageunit.\nadd <storageunit> <item> (amount)",["storageunit: Name of a storageunit.","item: Name of an item.","amount: (optional) The amount of items to be moved."],false,1)
            break
        case commands.remove:
            printWrappedList("Used to remove items from a storageunit.\nremove <storageunit> <item> (amount)",["storageunit: Name of a storageunit.","item: Name of an item.","amount: (optional) The amount of items to be moved."],false,1)
            break
        case commands.ls:
            printWrappedList("Used to list the contents of an inventory.\nls (storageunit)",["storageunit: (optional) the storage unit you want to list the contents of, can also be 'all'"])
            break
        case commands.clear:
            console.log("Used to clear the Terminal.\nclear")
            break
        case commands.find:
            printWrappedList("Used to find the location of an item in inventory.\nfind <item-name>",["item-name: Name of the item that you want to find."],false,1)
            break
        case commands.account:
            console.log("Used to display information about the current account.\naccount")
            break
        case commands.donate:
            donateCommand()
            break
    }
    console.log("\n")
}

function genAutocomplete(){ //generate the autocomplete list
    casketSug={}
    inventorySug=[]
    commonSug=[]
    for(let i=0;i<parsedInv.casket.length;i++){
        let casket=parsedInv.casket[i]
        let casketName = casket.itemName.replace(/ /g, "_"); // replace spaces with underscores
        casketSug[casketName]=[]
        for(let y = 0;y<casket.content.unique.length;y++){  //add unique items in caskets to autocomplete
            let name=casket.content.unique[y].itemName.replace(/ /g, "_")
            casketSug[casketName].push(name)
            let commonName=name.slice(0,-8)
            if(!commonSug.includes(commonName)){
                commonSug.push(commonName) 
            }
        }
        let items = Object.keys(casket.content.generic).map(s => s.replace(/ /g, "_"))
        casketSug[casketName].push(...items)
        for(let i =0;i<items.length;i++){
            if(!commonSug.includes(items[i])){
                commonSug.push(items[i])
            }
        }
    }
    for(let x=0;x<parsedInv.unique.length;x++){ //add unique items in inventory to autocomplete
        let name=parsedInv.unique[x].itemName.replace(/ /g, "_")
        inventorySug.push(name)
        let commonName=name.slice(0,-8)
        if(!commonSug.includes(commonName)){
            commonSug.push(commonName)
        }
    }
    let items=Object.keys(parsedInv.generic).map(s => s.replace(/ /g, "_")) // add generic items in inventory to autocomplete
    inventorySug.push(...items)
    for(let i =0;i<items.length;i++){
        if(!commonSug.includes(items[i])){
            commonSug.push(items[i])
        }
    }
    //fs.writeFileSync('casketSug.json', JSON.stringify(casketSug, null, 2)); //export casket suggestions to see if generation worked (debug)
    initReadline();
}

function parseInv(){    //parse the inventory into readable format
    
    let inputActive;
    if(rl){
        rl.close()
        inputActive=true
    }


    inventory = csgo.inventory; //reload
    parsedInv={"unique":[],"generic":{},"casket":[]} //clear parsed inventory

    const multibar= new cliProgress.MultiBar({
        clearOnComplete:true,
        hideCursor:true,
        format:' {bar} | {filename} | {value}/{total}'
    }, cliProgress.Presets.rect)

    const bar = multibar.create(parsedInv.casket.length,0)
    bar.update(0,{filename:"Parsing Inventory"})


    //const bar = new cliProgress.SingleBar({}, cliProgress.Presets.rect)
    //bar.start(inventory.length, 0)
    
    

    for(let i=0;i<inventory.length;i++){
        let item = identItem(inventory[i])

        if(item.itemCasket){//if item is in a casket, skip it
            //bar.update(i + 1)
            bar.increment()
            continue
        }

        if(item.itemType == 5 || item.itemType == 10){ // if item type is non-econ(5) or Not a regular item (10), skip it
            bar.increment()
            //bar.update(i + 1)
            continue
        }

        if(item.itemType == 1 || item.itemType == 2 || item.itemType == 3){ // When the item is generic(case,sticker,patch), summarize them in an array
            if(parsedInv.generic.hasOwnProperty(item.itemName)){ //when entry for generic item exists, append it
                parsedInv.generic[item.itemName].itemIds.push(item.itemId)
                parsedInv.generic[item.itemName].quantity += 1
            }else{ //when entry for generic item doesn't exist create it
                parsedInv.generic[item.itemName] = {
                    itemName:   item.itemName,
                    itemIds:    [item.itemId],
                    quantity:   1
                }
            }
            bar.increment()
            //bar.update(i + 1)

        }else if(item.itemType==4){
            parsedInv.casket.push(item) //if item is storageunit add to "casket" array
            bar.increment()
            //bar.update(i + 1)
            
        }else{ //when item is unique, add them to the unique array
            parsedInv.unique.push(item) //add parsed item to parsedInv array
            bar.increment
            //bar.update(i + 1); // Update the progress bar
        }
    }
    multibar.stop()
    //bar.stop() //stop progress bar
    if(inputActive){
        initReadline()
    }
}

function identItem(item){ //identify the item for a given item object, return type (0=regular skin, 1=crate, 2=sticker, 3=patches, 4=storageunit, 5=misc/non-econ)
    
    let itemType, itemName, itemFloat,itemSt, itemCasket, commonName, stKills, paintSeed, itemRarity = null

    if(item.flags==0 || item.flags==4){ //flags=0, Item is a regular item

        if(item.hasOwnProperty('paint_index')){ //item is a regular skin
            commonName = itemDb.find(obj => obj.paint_index == item.paint_index && obj.weapon.weapon_id==item.def_index).name //retrieve Item name from itemDb
            commonName = commonName.replace(/\s*\(.*?\)\s*/g, '').trim()    //remove condition from itemName
            itemName = commonName + ` (${Number.parseFloat(item.paint_wear).toFixed(3)})`
            itemType = 0    // assign itemType 0 for regular skin
            itemFloat = item.paint_wear   
            itemSt = item.hasOwnProperty('kill_eater_value') // set itemSt to True if item has stattrak attribute
            stKills=item.kill_eater_value
            paintSeed=item.paint_seed
            itemRarity=item.rarity
        }else if(items_game[item.def_index].prefab=="weapon_case" || items_game[item.def_index].prefab=="sticker_capsule"){ //item is a weapon case
            itemName = itemDb.find(obj => obj.id == "crate-"+item.def_index).name //retrieve name for crate
            itemType = 1 //assgin itemType 1 for crate
        }else if(item.def_index=="1209"){// item ist ein sticker
            itemName="Generic Sticker" //to be implemented
            itemType = 2 //assign itemType 2 for sticker
            
        }else if(item.def_index=="4609"){// item ist ein patch
            itemName = "Generic Patch"
            itemType = 3 //assign itemType 3 for patches
            
        }else if(item.def_index=="1201"){ //item is a storageunit
            itemName = item.custom_name // set storage unit name to its id for now
            itemType=4 //assign itemType 4 for storageunits
            
        }else{
            itemName = "Non econ item"
            itemType = 5 //assign itemType 5 for misc/non econ items
            
        }
        if(item.hasOwnProperty("casket_id")){//if item is in a casket, set the itemCasket property to the casket_id
            itemCasket=item.casket_id
        }

    }else{ // return "Not a regular item"
        return {itemType:10,itemName:"Not a regular item.",itemFloat:itemFloat,itemId:item.id,itemSt:itemSt,itemCasket:itemCasket}
    }
    return {
        itemType:itemType,
        itemName:itemName,
        itemFloat:itemFloat,
        itemId:item.id,
        itemSt:itemSt,
        itemCasket:itemCasket,
        commonName:commonName,
        stKills:stKills,
        paintSeed:paintSeed,
        itemRarity:itemRarity
    }
}

function floatParser(float,short=true){ //converts item float value to condition name
    if(float<0.07){
        return short?"FN":"Factory New"
    }else if(float>0.07 && float<=0.15){
        return short?"MW":"Minimal Wear"
    }else if(float>0.15 && float<=0.37){
        return short?"FT": "Field-Tested"
    }else if(float>0.37 && float<=0.45){
        return short?"WW":"Well-Worn"
    }else if(float>0.45 && float<=1.00){
        return short?"BS":"Battle-Scarred"
    }
}

function rarityParser(rarity, color=false){

    switch (rarity){
        case 1:
            return color? "\x1b[90m" : "Consumer Grade"
        case 2: 
            return color? "\x1b[0;38;2;3;172;252;49m" : "Industrial Grade"
        case 3: 
            return color? "\x1b[0;38;2;3;61;252;49m" : "Mil-Spec"
        case 4: 
            return color? "\x1b[0;38;2;132;3;252;49m" : "Restricted"
        case 5:
            return color? "\x1b[0;38;2;236;3;252;49m" : "Classified"
        case 6:
            return color? "\x1b[31m" : "Covert"
        case 7:
            return color? "\x1b[33m" : "Contraband"


    }
}

function loadCaskets(callback) { //loads caskets and parses them into the casket subobjects
    casketsLoaded = 0; // reset the counter each time

    const multibar= new cliProgress.MultiBar({
        clearOnComplete:true,
        hideCursor:true,
        format:' {bar} | {filename} | {value}/{total}'
    }, cliProgress.Presets.rect)

    

    //const bar = new cliProgress.SingleBar({}, cliProgress.Presets.rect)
    
    if (parsedInv.casket.length === 0) {
        if (callback) callback();
        return;
    }

    let inputActive;
    if(rl){
        rl.close()
        inputActive=true
    }
    
    const bar = multibar.create(parsedInv.casket.length,0)
    bar.update(0,{filename:"Loading Storageunits"})
    //bar.start(parsedInv.casket.length, 0)
    
    for (let i = 0; i < parsedInv.casket.length; i++) {
        const casket = parsedInv.casket[i];
        // Always initialize content object, even if casket is empty
        casket.content = { unique: [], generic: {} };
        csgo.getCasketContents(casket.itemId, (err, items) => {
            if (err) {
                console.error("Failed to load Casket:", err);
            } else {
                // Process each item with identItem
                for (const item of items) {
                    const processed = identItem(item);
                    if (processed.itemType === 1 || processed.itemType === 2 || processed.itemType === 3) {
                        // Generic item
                        if (casket.content.generic.hasOwnProperty(processed.itemName)) { //if generic item already has an entry, append it
                            casket.content.generic[processed.itemName].itemIds.push(processed.itemId);
                            casket.content.generic[processed.itemName].quantity += 1;
                        } else {
                            casket.content.generic[processed.itemName] = { //if generic item doesnt have entry, create one
                                itemName: processed.itemName,
                                itemIds: [processed.itemId],
                                quantity: 1
                            };
                        }
                    }else if(processed.itemType== 5 || processed.itemType == 10){ //if item is non-econ/non-regular, skip it
                        continue
                    }else {
                        // Unique item
                        casket.content.unique.push(processed);
                    }
                }
            }
            casketsLoaded += 1;
            
            bar.increment()
            //bar.update(i+1)
            
            
            if (casketsLoaded === parsedInv.casket.length) { //if all caskets are loaded, call the callback function
                //bar.stop()
                multibar.stop()

                if(inputActive){initReadline}

                if (callback) callback();
            }
        });
    }
}

function moveTo(itemIds, target) {  //moves items to a storage unit, takes an array of itemIds as input
    const bar = new cliProgress.SingleBar({hideCursor:true,clearOnComplete:true}, cliProgress.Presets.rect,);
    let completed = 0;
    let inFlight = 0;
    let queue = [...itemIds];
    const MAX_CONCURRENT = 2;

    let inputActive;
    if(rl){
        rl.close()
        inputActive=true
    }


    bar.start(itemIds.length, 0);

    function startNext() {
        while (inFlight < MAX_CONCURRENT && queue.length > 0) {
            const itemId = queue.shift();
            inFlight++;
            try {
                csgo.addToCasket(target, itemId);
            } catch (err) {
                console.error('Error while adding items to Storageunit:', err);
            }
        }
    }

    function onNotification(item,notificationType) {
        if (
            notificationType === GlobalOffensive.ItemCustomizationNotification.CasketAdded
        ) {
            completed++;
            inFlight--;
            bar.update(completed);
            if (completed >= itemIds.length) {
                bar.stop();
                if(inputActive){
                    initReadline()
                }
                csgo.removeListener('itemCustomizationNotification', onNotification);
                parseInv()
                loadCaskets(genAutocomplete)
            } else {
                startNext();
            }
        }
    }
    csgo.on('itemCustomizationNotification', onNotification);

    startNext();
}

function moveFrom(itemIds, source) {//moves items from a casket to the inventory, takes an array og itemIds as input
    const bar = new cliProgress.SingleBar({hideCursor:true,clearOnComplete:true}, cliProgress.Presets.rect);
    let completed = 0;
    let inFlight = 0;
    let queue = [...itemIds];
    const MAX_CONCURRENT = 2;

    bar.start(itemIds.length, 0);

    let inputActive;
    if(rl){
        rl.close()
        inputActive=true
    }

    function startNext() {
        while (inFlight < MAX_CONCURRENT && queue.length > 0) {
            const itemId = queue.shift();
            inFlight++;
            try {
                csgo.removeFromCasket(source, itemId);
            } catch (err) {
                console.error('Error while removing items from Storageunit:', err);
            }
        }
    }

    function onNotification(item,notificationType) {
        if (
            notificationType === GlobalOffensive.ItemCustomizationNotification.CasketRemoved
        ) {
            completed++;
            inFlight--;
            bar.update(completed);
            if (completed >= itemIds.length) {
                bar.stop();
                if(inputActive){
                    initReadline()
                }
                csgo.removeListener('itemCustomizationNotification', onNotification);
                parseInv() // re-parse the inventory
                loadCaskets(genAutocomplete)
            } else {
                startNext();
            }
        }
    }
    csgo.on('itemCustomizationNotification', onNotification);

    startNext();
}

function lsCommand(scope="inv"){
    let caskets=[]
    for(let i=0;i<parsedInv.casket.length;i++){
        caskets.push(parsedInv.casket[i].itemName)
    }
    if(scope=="inv" || scope =="inventory"){
        let generics=[]
        let total=0
        for(let i=0;i<Object.keys(parsedInv.generic).length;i++){
            let itemStr=`${parsedInv.generic[Object.keys(parsedInv.generic)[i]].itemName} (${parsedInv.generic[Object.keys(parsedInv.generic)[i]].quantity}x)`
            generics.push(itemStr)
            total+=parsedInv.generic[Object.keys(parsedInv.generic)[i]].quantity
        }
        // Sort generics array by the integer in the last parentheses at the end of the string, descending
        generics.sort((a, b) => {
            // Extract the number between the last pair of parentheses at the end
            const getX = str => {
                const match = str.match(/\((\d+)\)$/);
                return match ? parseInt(match[1], 10) : 0;
            };
            return getX(b) - getX(a);
        });
        let uniques=[]
        for(let i=0;i<parsedInv.unique.length;i++){
            let item = parsedInv.unique[i]
            let itemStr
            if(item.itemType==0){
                itemStr=`${rarityParser(item.itemRarity,true)}${item.itemName}\x1b[0m`
            }else{
                itemStr=`${item.itemName}`
            }
                uniques.push(itemStr)
        }
        total+=uniques.length
        printWrappedList("Storageunits:",caskets)
        printWrappedList("Generic Items:",generics)
        printWrappedList("Unique Items:",uniques,true)
        console.log("Total:",total)
    }else if(caskets.indexOf(scope)>-1){ //check if there is a casket with matching name
        let generics=[]
        let total=0
        let casket=parsedInv.casket[caskets.indexOf(scope)]

        for(let i=0;i<Object.keys(casket.content.generic).length;i++){
            let itemStr=`${casket.content.generic[Object.keys(casket.content.generic)[i]].itemName} (${casket.content.generic[Object.keys(casket.content.generic)[i]].quantity})`
            generics.push(itemStr)
            total+=casket.content.generic[Object.keys(casket.content.generic)[i]].quantity
        }
        generics.sort((a, b) => {
            // Extract the number between the last pair of parentheses at the end
            const getX = str => {
                const match = str.match(/\((\d+)\)$/);
                return match ? parseInt(match[1], 10) : 0;
            };
            return getX(b) - getX(a);
        });
        
        let uniques=[]
        for(let i=0;i<casket.content.unique.length;i++){
            let item=casket.content.unique[i]
            let itemStr
            if(item.itemType==0){
                itemStr=`${rarityParser(item.itemRarity,true)}${item.itemName}\x1b[0m`
                
            }else{
                itemStr=`${item.itemName}`
            }
            uniques.push(itemStr)
        }
        total+=uniques.length
        printWrappedList("Generic Items:",generics)
        printWrappedList("Unique Items:",uniques,true)
        console.log("Total:",total)

    }else if(scope=="all" || scope=="a"){
        let uniques=[]
        let genericsObj={}
        for(let i=0;i<Object.keys(parsedInv.casket).length;i++){
            let casket=parsedInv.casket[Object.keys(parsedInv.casket)[i]]
            for(let x=0;x<Object.keys(casket.content.generic).length;x++){ //iterate over generic items in casket and store their quantity in the genericsObj
                let itemObj=casket.content.generic[Object.keys(casket.content.generic)[x]]
                if(genericsObj.hasOwnProperty(itemObj.itemName)){
                    genericsObj[itemObj.itemName] += itemObj.quantity
                }else{
                    genericsObj[itemObj.itemName] = itemObj.quantity;
                }
            }for(let x=0;x<casket.content.unique.length;x++){
                let itemObj=casket.content.unique[x]
                let itemStr
                if(itemObj.itemType==0){
                    itemStr=`${rarityParser(itemObj.itemRarity,true)}${itemObj.itemName}\x1b[0m`
                }else{
                    itemStr=`${item.itemName}`
                }
                uniques.push(itemStr)
            }
            
        }
        let generics=[]
        let total =uniques.length
        for(let x=0;x<Object.keys(genericsObj).length;x++){ //iterate over the keys in the genericsObj and format as string with their name and quantity ("Some Name (x)")
            generics.push(`${Object.keys(genericsObj)[x]} (${genericsObj[Object.keys(genericsObj)[x]]})`)
            total+=genericsObj[Object.keys(genericsObj)[x]]
        }

        generics.sort((a, b) => {
            // Extract the number between the last pair of parentheses at the end
            const getX = str => {
                const match = str.match(/\((\d+)\)$/);
                return match ? parseInt(match[1], 10) : 0;
            };
            return getX(b) - getX(a);
        })

        printWrappedList("Storageunits:",caskets)
        printWrappedList("Generic Items:",generics,true)
        printWrappedList("Unique Items:", uniques,true)
        console.log("Total:",total)
    }

}

function moveItemFromCasket(itemName, casketName, amount = 1) { //gets the array of itemIds to be moved and passes them to the moveFrom() function
    // Find the casket by id
    const casket = parsedInv.casket.find(c => c.itemName === casketName);
    const casketId = casket.itemId
    if (!casket || !casket.content) {
        console.error('Casket not found or content not loaded');
        return;
    }
    let used = parsedInv.unique.length                  //calculate amount of items in inventory
                                                        //
    for (let i=0;i<parsedInv.generic.length;i++){       //
        used+=parsedInv.generic[i].quantity             //
    }

    if(1000-used<amount){//Not enough space in Inventory
        console.error(`Inventory is too full: ${amount} needed, ${1000-used} available`)
        return
    }
    // Check unique array
    const uniqueItem = casket.content.unique.find(item => item.itemName === itemName);
    if (uniqueItem) {
        // Move the first matching unique item
        moveFrom([uniqueItem.itemId], casketId);
        return;
    }
    // Check generic object
    const genericItem = casket.content.generic[itemName];
    if (genericItem && genericItem.quantity >= amount) {
        // Move the first 'amount' itemIds
        moveFrom(genericItem.itemIds.slice(0, amount), casketId);
        return;
    }
    // Not found or not enough quantity
    console.error('Item not found in casket or insufficient quantity');
}

function moveItemToCasket(itemName, casketName, amount = 1){ //gets the array of itemIds to be moved and passes them to the moveTo() functionconsole.log(casketName)

    const casket = parsedInv.casket.find(c=>c.itemName==casketName)

    const casketId=casket.itemId
    let used = casket.content.unique.length             //calculate amount of items in casket
                                                        //
    for (let i=0;i<casket.content.generic.length;i++){  //
        used+=casket.content.generic[i].quantity                //
    }
    if(1000-used<amount){//Not enough space in Casket
        console.error(`Storageunit is too full: ${amount} needed, ${1000-used} available`)
        return
    }

    const uniqueItem=parsedInv.unique.find(item => item.itemName === itemName);
    if(uniqueItem){ // If it is a unique Item move it, ignore amount
        moveTo([uniqueItem.itemId],casketId)
    }

    const genericItem = parsedInv.generic[itemName];
    if(genericItem && genericItem.quantity>=amount){ //if item is generic, check if sufficient quantity is available 
        moveTo(genericItem.itemIds.slice(0,amount),casketId) //move the first x items from the itemIds array to the casket
        return;
    }
    console.error("Item not found in inventory or insufficient amount")

}

function printWrappedList(label, items, contrast=false,maxLineLength = process.stdout.columns || 100) {
    // ANSI escape codes for colors
    const WHITE = '\x1b[37m';
    const GREY = '\x1b[90m'; // Bright black (light grey)
    const RESET = '\x1b[0m';
    let line = "     ⮱ ";
    let output = label + "\n" + line;
    for (let i = 0; i < items.length; i++) {
        let item;
        if (contrast) {
            let color = (i % 2 === 0) ? WHITE : GREY;
            item = color + items[i] + RESET;
        } else {
            item = items[i];
        }
        let next = (i === 0 ? "" : ", ") + item;
        // For length, ignore color codes if present
        let lineLength = (line + next).replace(/\x1b\[[0-9;]*m/g, '').length;
        if (lineLength > maxLineLength) {
            output += "\n       " + item;
            line = "       " + item;
        } else {
            output += (i === 0 ? "" : ", ") + item;
            line += (i === 0 ? "" : ", ") + item;
        }
    }
    console.log(output);
}

function makeHashName(item){
    let hashName
    if(item.itemType==0){
        if(item.itemSt){
            hashName=`StatTrak™ ${item.itemName.slice(0,-8)} (${floatParser(item.itemFloat,false)})`
        }else{
            hashName=`${item.itemName.slice(0,-8)} (${floatParser(item.itemFloat,false)})`
        }
    }else{
        hashName=`${item.itemName}`
    }
        return hashName
}

function findCommand(itemName){
    let found={}

    let generic=parsedInv.generic
    let unique=parsedInv.unique
    let caskets=parsedInv.casket
    //Search unique items
    for(let i=0;i<unique.length;i++){
        let item =unique[i]
        if(item.commonName==itemName){
            if(found.hasOwnProperty("Inventory")){
                found["Inventory"].push({"itemName":item.itemName,"commonName":itemName,"rarity":item.itemRarity})
            }else{
                found["Inventory"]=[{"itemName":item.itemName,"commonName":itemName,"rarity":item.itemRarity}]
            }
        }
    }
    
    for(let i=0;i<Object.keys(generic).length;i++){
        if(Object.keys(generic)[i]==itemName){
            found["Inventory"]={"itemName":itemName,"quantity":generic[Object.keys(generic)[i]].quantity}
        }
    }
    
    for(let i=0;i<caskets.length;i++){
        let casket=caskets[i]
        for(let i=0;i<casket.content.unique.length;i++){
            let item=casket.content.unique[i]
            if(item.commonName==itemName){
                if(found.hasOwnProperty(casket.itemName)){
                    found[casket.itemName].push({"itemName":item.itemName,"commonName":itemName,"rarity":item.itemRarity})
                }else{
                    found[casket.itemName]=[{"itemName":item.itemName,"commonName":itemName,"rarity":item.itemRarity}]
                }
            }
        }for(let i=0;i<Object.keys(casket.content.generic).length;i++){
            if(Object.keys(casket.content.generic)[i]==itemName){
                found[casket.itemName]={"itemName":itemName,"quantity":casket.content.generic[Object.keys(casket.content.generic)[i]].quantity}
            }
        }
    }
    for(let i=0;i<Object.keys(found).length;i++){
        let location=Object.keys(found)[i]
        let outStr=`${location}:\n     ⮱ `
        if(Array.isArray(found[location])){ //item is unique
            for(let y=0;y<found[location].length;y++){
                let item=found[location][y]
                if(item.hasOwnProperty("rarity")){
                    outStr+=`${rarityParser(item.rarity,true)}${item.itemName}\x1b[0m\n`
                }else{
                    outStr+=`${item.itemName}\n`
                }
                
            }
            
        }else{ //item is generic
            outStr+=`${found[location].itemName} (${found[location].quantity}x)\n`
        }
        console.log(outStr)
               
    }
}

function sellCommand(itemNames){

    let url=`https://steamcommunity.com/market/multisell?appid=730&contextid=2`
    for(let i=1;i<itemNames.length;i++){
        if(!parsedInv.generic.hasOwnProperty(itemNames[i])){
            console.log(`This command currently only supports generic items. But "${itemNames[i]}" is a unique item.`)
            continue
        }
        url+=`&items[]=${itemNames[i]}`
    }
    let hyperlink=`\u001b]8;;${url}\u0007${"Steam Multisell Page"}\u001b]8;;\u0007`
    console.log(`Go to ${hyperlink}`)
}

function inspectCommand(itemName){
    //find item-object by its name
    let item=parsedInv.unique.find(item=>item.itemName===itemName)
    if(!item){
        for(let i=0;i<parsedInv.casket.length;i++){
            let casket=parsedInv.casket[i]
            item = casket.content.unique.find(item=>item.itemName===itemName)
            if(item) break
        }
    }
    if(!item){
        console.error("The item is not inspectable, it is either generic or doesn't exist in Inventory.")
        return
    }

    if(item.itemSt){
        console.log(`${rarityParser(item.itemRarity,true)}${item.itemName}\x1b[0m:\n
        Hash Name: ${makeHashName(item)}
            Float: ${item.itemFloat}
       Float Name: ${floatParser(item.itemFloat)}
           Rarity: ${rarityParser(item.itemRarity,true)}${rarityParser(item.itemRarity,false)}\x1b[0m
       Paint Seed: ${item.paintSeed}
   StatTrak Kills: ${item.stKills}
            `)
    }else{
        console.log(`${rarityParser(item,true)}${item.itemName}\x1b[0m:\n
        Hash Name: ${makeHashName(item)}
            Float: ${item.itemFloat}
       Float Name: ${floatParser(item.itemFloat,false)}
           Rarity: ${rarityParser(item,true)}${rarityParser(item,false)}\x1b[0m
       Paint Seed: ${item.paintSeed}
            `)
    }
}

function donateCommand(){
    const donateJokes=[
        "A bug fix today keeps the crash logs away—fund a dev!",
        "A donation a day keeps the subscription away.",
        'Open source: free as in freedom, not as in "freeload." Donate.',
        "Running FOSS without donating is like partying in someone else's house without bringing snacks.",
        "Don’t like ads? Donate to FOSS and keep the pop-ups in the '90s where they belong.",
        "If it saves you time, maybe spare it a dime.",
        "No paywall? No problem. Just hit that donate button.",
        "Open source isn’t magic—it runs on code, caffeine, and community support.",
        "Open source is a gift—just don’t forget the thank-you note (and a tip)."
    ]
    const donationLink="https://lilbiba400.github.io/invman-donations/"
    const hyperlink=`\u001b]8;;${donationLink}\u0007${"INVMAN donation page"}\u001b]8;;\u0007`
    console.log(`\n${donateJokes[Math.floor(Math.random() * donateJokes.length)]}\n\nTo get to the Donation-Page follow this link => ${hyperlink}\n\nOr scan this QR-Code:`)
    qrcode.generate(donationLink,{small:true})
}

function main() { //main function
    if(REFRESH_TOKEN){// if new refreshtoken was received, update it
        saveRefreshToken(REFRESH_TOKEN,user.accountInfo.name,user.steamID)
    }
    console.clear()
    genAutocomplete();
    /*
    fs.writeFileSync("parsedInv.json", JSON.stringify(parsedInv,null,2), 'utf8');
    fs.writeFileSync("invSug.json", JSON.stringify(inventorySug,null,2), 'utf8');
    fs.writeFileSync("inventory.json", JSON.stringify(inventory,null,2), 'utf8');
    fs.writeFileSync("itemDb.json", JSON.stringify(itemDb,null,2), 'utf8');
    */
    }

if(!fs.existsSync(REFRESH_TOKEN_PATH)){//check if accounts/ directory exists, if not, create it
    fs.mkdirSync(REFRESH_TOKEN_PATH)
}

getSources().then(handleLogin())

