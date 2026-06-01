const parsedData = {
  "word": "expert",
  "display_breakdown": "ex.pert",
  "phonetic_us": "//ek.spɜːt//",
  "primary_meaning": "专家",
  "noun_source": "English (专家)",
  "parts": [
    {
      "segment": "ex",
      "type": "prefix",
      "meaning": "向外；由...出来；彻底地",
      "deep_origin": "...",
      "derivatives": null
    },
    {
      "segment": "pert",
      "type": "root",
      "meaning": "熟练的；精通的",
      "deep_origin": "...",
      "derivatives": ["expertise", "expertly"]
    }
  ],
  "memory_lines": ["..."]
};

let toSave = {};
let allData = {};
let config = {};
let rootStrategy = 'keep_old';
let word = 'expert';
let sourceTag = 'ollama';
let context = 'general';

(parsedData.parts || []).forEach(p => {
    const cleanRoot = (p.segment || '').toLowerCase().replace(/^-|-$/g, '').trim();
    if (!cleanRoot) return;
    const rootKey = "R:" + cleanRoot;
    
    let rawDerivs = p.derivatives;
    if (typeof rawDerivs === 'string') rawDerivs = rawDerivs.split(',');
    const derivsArray = Array.isArray(rawDerivs) ? rawDerivs : [];
    const cleanDerivatives = derivsArray.map(d => {
        let str = typeof d === 'string' ? d : d.word;
        return (str || '').replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim();
    }).filter(Boolean);
    
    const existingRoot = allData[rootKey] || {};
    p.lookup_count = existingRoot.lookup_count || 0;
    p.updated_at = existingRoot.updated_at || Date.now();

    if (allData[rootKey] && rootStrategy === 'keep_old') {
        p.meaning = allData[rootKey].meaning || p.meaning; 
        p.deep_origin = allData[rootKey].deep_origin || p.deep_origin; 
        let oldRawDerivs = allData[rootKey].derivatives;
        if (typeof oldRawDerivs === 'string') oldRawDerivs = oldRawDerivs.split(',');
        const oldDerivsArray = Array.isArray(oldRawDerivs) ? oldRawDerivs : [];
        const oldDerivs = oldDerivsArray.map(d => {
            let str = typeof d === 'string' ? d : d.word;
            return (str || '').replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim();
        });
        p.derivatives = [...new Set([...oldDerivs, ...cleanDerivatives])];
        toSave[rootKey] = p; 
    } else {
        p.derivatives = [...new Set(cleanDerivatives)];
        toSave[rootKey] = p;
    }
});

const cleanWordKey = "W:" + word; 
let wordData = allData[cleanWordKey] || parsedData;
if (!wordData.memory_lines_map) wordData.memory_lines_map = {};

const newMapKey = `${sourceTag}_${context}`;
const editedKeys = wordData.edited_keys || [];
if (!editedKeys.includes(newMapKey)) {
  wordData.memory_lines_map[newMapKey] = parsedData.memory_lines || [];
}
wordData.display_breakdown = parsedData.display_breakdown || wordData.display_breakdown;
wordData.phonetic_us = parsedData.phonetic_us || wordData.phonetic_us;
wordData.primary_meaning = parsedData.primary_meaning || wordData.primary_meaning;
wordData.noun_source = parsedData.noun_source || wordData.noun_source;
wordData.parts = parsedData.parts; 

wordData.lookup_count = allData[cleanWordKey]?.lookup_count || 0;
wordData.updated_at = allData[cleanWordKey]?.updated_at || Date.now();

toSave[cleanWordKey] = wordData;

console.log("Success! toSave:", Object.keys(toSave));
