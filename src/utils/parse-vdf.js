/**
 *
 * @param {string} text
 *
 * @returns {object}
 */
export function parseVDF(text) {
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
