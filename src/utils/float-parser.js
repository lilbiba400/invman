/**
 * Converts item float value to condition name
 *
 * @param {number} float
 * @param {boolean} short
 *
 * @returns {string | undefined}
 */
export function floatParser(float, short=true) {
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
