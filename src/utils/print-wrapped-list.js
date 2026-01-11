/**
 *
 * Formats and prints an array of items to the Terminal  
 *
 * @param {*} label
 * @param {*} items
 * @param {*} contrast
 * @param {*} maxLineLength
 * @param {*} print
 *
 * @returns
 */
export function printWrappedList(label, items, contrast=false,maxLineLength = process.stdout.columns || 100,print=true) {
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
    }if(print){
        console.log(output)
    }return output
}
