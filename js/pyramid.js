document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('pyramid-search');
  const searchBtn = document.getElementById('pyramid-btn');
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('pyramid-content');
  
  const meaningEl = document.getElementById('pyramid-meaning');
  const rootsEl = document.getElementById('pyramid-roots');
  const originBox = document.getElementById('pyramid-origin-box');
  const originEl = document.getElementById('pyramid-origin');
  const derivBox = document.getElementById('pyramid-deriv-box');
  const derivsEl = document.getElementById('pyramid-derivs');
  const derivTitle = document.getElementById('pyramid-deriv-title');

  function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  const initialWord = getQueryParam('word');
  if (initialWord) {
    searchInput.value = initialWord;
    generatePyramid(initialWord);
  }

  searchBtn.addEventListener('click', () => {
    const word = searchInput.value.trim();
    if (word) generatePyramid(word);
  });

  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      const word = searchInput.value.trim();
      if (word) generatePyramid(word);
    }
  });

  function generatePyramid(word) {
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';

    // The backend in ai_root_english resolves "word" even if it is a root.
    // If it's pure root, it's better to pass it as it is.
    chrome.runtime.sendMessage({ action: "fetchLLM", word: word, forceRefresh: true }, (res) => {
      loadingEl.style.display = 'none';
      if (res && res.success && res.data) {
        renderPyramid(res.data);
      } else {
        alert("无法生成金字塔或网络请求失败，请重试");
      }
    });
  }

  function renderPyramid(data) {
    contentEl.style.display = 'flex';
    
    // Fallback logic in case 'data' is structured differently
    let rootData = data.root || data;
    
    // Meaning
    meaningEl.innerText = rootData.meaning || rootData.primary_meaning || "未知含义";
    
    // Segment base
    rootsEl.innerHTML = '';
    const segmentStr = rootData.segment || data.word || data.display_breakdown || "";
    const segments = segmentStr.split(/[,/|、+]+/).filter(s => s.trim());
    if (segments.length === 0 && data.word) segments.push(data.word);
    
    segments.forEach(seg => {
      const div = document.createElement('div');
      div.className = 'root-box';
      div.innerText = seg.trim();
      rootsEl.appendChild(div);
    });

    // Origin
    const originText = rootData.deep_origin || data.noun_source || "";
    if (originText) {
      originBox.style.display = 'block';
      originEl.innerText = originText;
    } else {
      originBox.style.display = 'none';
    }

    // Derivatives
    const derivs = data.derivatives || rootData.derivatives || [];
    if (derivs.length > 0) {
      derivBox.style.display = 'block';
      derivTitle.innerText = `派生词汇 (${derivs.length})`;
      derivsEl.innerHTML = '';
      derivs.forEach(d => {
        const item = document.createElement('div');
        item.className = 'deriv-item';
        let wordStr = typeof d === 'string' ? d : d.word;
        let meaningStr = typeof d === 'string' ? '' : d.meaning;
        item.innerText = wordStr + (meaningStr ? ` - ${meaningStr}` : '');
        item.onclick = () => {
            // open popup or tab, just simple click
            window.open(chrome.runtime.getURL('popup.html?word=' + encodeURIComponent(wordStr)), '_blank', 'width=400,height=600');
        };
        derivsEl.appendChild(item);
      });
    } else {
      derivBox.style.display = 'none';
    }
  }
});
