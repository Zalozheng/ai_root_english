window.initContextManager = function(initialPrompts, defaultGlobalJson) {
    const contextSelect = document.getElementById('prompt-context');
    const customContextInput = document.getElementById('custom-context-input');
    const promptArea = document.getElementById('custom-prompt');

    function renderContextSelect() {
        if (!contextSelect) return;
        contextSelect.innerHTML = '';
        const wordFilter = document.getElementById('word-context-filter');
        const rootFilter = document.getElementById('root-context-filter');
        if(wordFilter) wordFilter.innerHTML = '<option value="all">🌍 全部情景</option>';
        if(rootFilter) rootFilter.innerHTML = '<option value="all">🌍 全部情景</option>';

        window.appConfig.contexts.forEach(ctx => { 
            const opt = document.createElement('option'); opt.value = ctx.id; opt.textContent = ctx.name; contextSelect.appendChild(opt); 
            if(wordFilter) wordFilter.innerHTML += `<option value="${ctx.id}">${ctx.name}</option>`;
            if(rootFilter) rootFilter.innerHTML += `<option value="${ctx.id}">${ctx.name}</option>`;
        });
        contextSelect.value = window.appConfig.promptContext || 'general';
        checkCustomContextUI();
    }

    function checkCustomContextUI() {
        if (!contextSelect) return;
        const cur = contextSelect.value;
        const isCustom = cur.startsWith('custom');
        const wrapper = document.getElementById('rename-context-wrapper');
        if (wrapper) wrapper.style.display = isCustom ? 'flex' : 'none';

        if (isCustom && customContextInput) {
            const ctxObj = window.appConfig.contexts.find(c => c.id === cur);
            if (ctxObj) {
                customContextInput.value = ctxObj.name.replace(/^✍️\s*/, '');
            }
        }
    }

    if (document.getElementById('add-context-btn')) {
        document.getElementById('add-context-btn').addEventListener('click', () => {
            const name = prompt('➕ 请输入新情景的名称（例如：考研英语、医学词汇）：');
            if (name && name.trim()) {
                const newId = 'custom_' + Date.now();
                window.appConfig.contexts.push({ id: newId, name: '✍️ ' + name.trim() });
                window.appConfig.prompts[newId] = "";
                window.appConfig.promptContext = newId;
                chrome.storage.local.set({ app_config: window.appConfig }, () => {
                    renderContextSelect();
                    updatePromptArea();
                    window.showStatus('✅ 新情景已创建', '#10b981');
                });
            }
        });
    }

    if (document.getElementById('rename-context-btn')) {
        document.getElementById('rename-context-btn').addEventListener('click', () => {
            const cur = contextSelect.value;
            const newName = customContextInput.value.trim();
            if (cur.startsWith('custom') && newName) {
                const ctxObj = window.appConfig.contexts.find(c => c.id === cur);
                if (ctxObj) {
                    ctxObj.name = '✍️ ' + newName;
                    chrome.storage.local.set({ app_config: window.appConfig }, () => {
                        renderContextSelect();
                        window.showStatus('✅ 情景命名已更新', '#10b981');
                    });
                }
            } else {
                window.showStatus('⚠️ 名称不能为空', '#f59e0b');
            }
        });
    }

    if (document.getElementById('delete-context-btn')) {
        document.getElementById('delete-context-btn').addEventListener('click', () => {
            const currentId = contextSelect.value;
            if (!currentId.startsWith('custom')) return window.showStatus('⚠️ 系统预设情景不可删除', '#f59e0b');
            if (confirm('确定彻底删除此自定义情景？（注意：这不会删除词库里的数据，只会删除此预设身份）')) {
                window.appConfig.contexts = window.appConfig.contexts.filter(c => c.id !== currentId);
                delete window.appConfig.prompts[currentId];
                window.appConfig.promptContext = 'general';
                chrome.storage.local.set({ app_config: window.appConfig }, () => {
                    renderContextSelect(); 
                    updatePromptArea();
                    window.showStatus('✅ 已删除该情景', '#10b981');
                });
            }
        });
    }

    if (contextSelect && !document.getElementById('global-json-card')) {
        let card = contextSelect.parentElement;
        while(card && card.tagName !== 'BODY') { if (card.textContent.includes('界面设定与历史')) break; card = card.parentElement; }
        if (card && card.tagName !== 'BODY') {
            const globalCard = document.createElement('div');
            globalCard.id = 'global-json-card';
            globalCard.innerHTML = `
                <div class="json-title">
                    <span>🧩 全局底层 JSON 结构约束</span>
                    <button id="reset-global-json-btn" class="btn-outline" style="padding: 4px 10px; font-size: 12px;">🔄 恢复默认结构</button>
                </div>
                <div style="font-size: 12px; color: #888; margin-bottom: 12px; line-height: 1.5;">无论下方切换什么情景，解析时都会自动套用此处数据格式。</div>
                <textarea id="global-json-prompt" spellcheck="false"></textarea>
            `;
            card.parentNode.insertBefore(globalCard, card);
            const jsonTextarea = document.getElementById('global-json-prompt');
            jsonTextarea.value = window.appConfig.globalJsonTemplate;
            jsonTextarea.addEventListener('input', (e) => window.appConfig.globalJsonTemplate = e.target.value);
            document.getElementById('reset-global-json-btn').addEventListener('click', () => {
                jsonTextarea.value = defaultGlobalJson; window.appConfig.globalJsonTemplate = defaultGlobalJson; window.showStatus('🔄 已恢复默认', '#10b981');
            });
        }
    }

    if (contextSelect) {
        renderContextSelect();
        contextSelect.addEventListener('change', (e) => {
            window.appConfig.promptContext = e.target.value;
            checkCustomContextUI();
            updatePromptArea();
        });
    }

    if (!window.appConfig.customDefaults) window.appConfig.customDefaults = {};
    function updatePromptArea() {
        if (!promptArea) return;
        const currentId = window.appConfig.promptContext || 'general';
        promptArea.value = window.appConfig.prompts[currentId] !== undefined ? window.appConfig.prompts[currentId] : (window.appConfig.customDefaults[currentId] || initialPrompts[currentId] || "");
    }
    updatePromptArea();

    if (promptArea) promptArea.addEventListener('input', (e) => window.appConfig.prompts[window.appConfig.promptContext || 'general'] = e.target.value);

    const restoreBtn = document.getElementById('restore-prompt-btn');
    if (restoreBtn) {
        const newRestoreBtn = restoreBtn.cloneNode(true); restoreBtn.parentNode.replaceChild(newRestoreBtn, restoreBtn);
        newRestoreBtn.textContent = '🔄 重置'; newRestoreBtn.style.cssText = 'padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid var(--border); background: var(--surface2); color: var(--text);';
        
        if (!document.getElementById('set-default-template-btn')) {
            const setDefBtn = document.createElement('button'); setDefBtn.id = 'set-default-template-btn';
            setDefBtn.style.cssText = 'margin-left: 10px; padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid #0ea5e9; background: rgba(14,165,233,0.1); color: #0ea5e9;';
            setDefBtn.textContent = '💾 设为专属默认模板';
            newRestoreBtn.parentNode.insertBefore(setDefBtn, newRestoreBtn.nextSibling);
            setDefBtn.addEventListener('click', () => {
                const currentId = window.appConfig.promptContext || 'general';
                window.appConfig.customDefaults[currentId] = promptArea.value;
                chrome.storage.local.set({ app_config: window.appConfig }, () => window.showStatus('✅ 已设为默认模板！', '#10b981'));
            });
        }
        newRestoreBtn.addEventListener('click', () => {
            const currentId = window.appConfig.promptContext || 'general';
            const defaultText = window.appConfig.customDefaults[currentId] || initialPrompts[currentId] || "";
            promptArea.value = defaultText; window.appConfig.prompts[currentId] = defaultText; window.showStatus('🔄 已重置', '#10b981');
        });
    }
};