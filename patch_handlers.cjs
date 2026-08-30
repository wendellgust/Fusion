const fs = require('fs');
const file = 'packages/player/src/components/SoundProvider.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace the single try-catch block with individual try-catch blocks for each handler.
// This ensures that one unsupported action doesn't prevent the others from being registered.

content = content.replace(/try\s*\{\s*navigator\.mediaSession\.setActionHandler\('play',([\s\S]*?)catch\s*\{\s*\/\*\s*ignore unsupported actions\s*\*\/\s*\}/g, (match) => {
    // We will extract each setActionHandler call and wrap it in try-catch
    const actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop'];
    let newContent = '';
    
    // Original block
    let remaining = match;
    
    actions.forEach(action => {
        const regex = new RegExp(`navigator\\.mediaSession\\.setActionHandler\\('${action}',\\s*(?:(?:\\(.*\\)\\s*=>\\s*\\{[\\s\\S]*?\\}\\s*\\);)|(?:null\\s*;))`);
        const actionMatch = remaining.match(regex);
        if (actionMatch) {
            newContent += `    try {\n      ${actionMatch[0]}\n    } catch (e) { console.warn('MediaSession error for ${action}:', e); }\n`;
        }
    });
    
    return newContent;
});

fs.writeFileSync(file, content);
console.log('Patched handlers');
