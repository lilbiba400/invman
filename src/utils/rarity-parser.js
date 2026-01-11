/**
 *
 * Returns name or color for given rarity value
 *
 * @param {number} rarity
 * @param {boolean} color
 *
 * @returns {string}
 */
export function rarityParser(rarity, color=false){
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
