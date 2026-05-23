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

    // ======= 全局 JSON 结构约束初始化 =======
    const jsonTextarea = document.getElementById('global-json-prompt');
    const resetJsonBtn = document.getElementById('reset-global-json-btn');
    if (jsonTextarea) {
        jsonTextarea.value = window.appConfig.globalJsonTemplate || defaultGlobalJson;
        jsonTextarea.addEventListener('input', (e) => window.appConfig.globalJsonTemplate = e.target.value);
    }
    if (resetJsonBtn && jsonTextarea) {
        resetJsonBtn.addEventListener('click', () => {
            if (confirm('🔄 确定要将 JSON 结构恢复为系统默认吗？')) {
                jsonTextarea.value = defaultGlobalJson; 
                window.appConfig.globalJsonTemplate = defaultGlobalJson; 
                window.showStatus('🔄 已恢复默认结构', '#10b981');
            }
        });
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

    
    // Edit logic for System Prompt
    const customPromptArea = document.getElementById('custom-prompt');
    const editPromptBtn = document.getElementById('edit-prompt-btn');
    const savePromptBtn = document.getElementById('save-prompt-btn');
    
    if (editPromptBtn && savePromptBtn && customPromptArea) {
        editPromptBtn.addEventListener('click', () => {
            customPromptArea.removeAttribute('readonly');
            customPromptArea.style.opacity = '1';
            customPromptArea.style.borderColor = '#38bdf8';
            customPromptArea.rows = 8;
            editPromptBtn.style.display = 'none';
            savePromptBtn.style.display = 'inline-block';
            customPromptArea.focus();
        });
        
        savePromptBtn.addEventListener('click', () => {
            const currentId = window.appConfig.promptContext || 'general';
            window.appConfig.prompts[currentId] = customPromptArea.value.trim();
            chrome.storage.local.set({ app_config: window.appConfig }, () => {
                window.showStatus('💾 情景指令已保存', '#38bdf8');
                customPromptArea.setAttribute('readonly', 'true');
                customPromptArea.style.opacity = '0.7';
                customPromptArea.style.borderColor = '#333';
                customPromptArea.rows = 3;
                savePromptBtn.style.display = 'none';
                editPromptBtn.style.display = 'inline-block';
            });
        });
    }

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