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

    // ======= 高级编辑模式逻辑 (禅模式：大框大字) =======
    function bindEditMode(textAreaId, editBtnId, saveBtnId, highlightColor, expandedRows) {
        const area = document.getElementById(textAreaId);
        const editBtn = document.getElementById(editBtnId);
        const saveBtn = document.getElementById(saveBtnId);
        const backdrop = document.getElementById('editor-backdrop');
        const container = area.parentElement; // 获取 form-group 或 section-box
        
        if (area && editBtn && saveBtn && backdrop) {
            editBtn.addEventListener('click', () => {
                // 进入大框模式
                backdrop.style.display = 'block';
                
                // 将容器临时变为固定定位
                container.style.position = 'fixed';
                container.style.top = '50%';
                container.style.left = '50%';
                container.style.transform = 'translate(-50%, -50%)';
                container.style.width = '85vw';
                container.style.height = '75vh';
                container.style.zIndex = '1001';
                container.style.background = '#111';
                container.style.padding = '30px';
                container.style.borderRadius = '16px';
                container.style.boxShadow = `0 0 50px ${highlightColor}33`;
                container.style.border = `2px solid ${highlightColor}`;
                container.style.display = 'flex';
                container.style.flexDirection = 'column';

                area.removeAttribute('readonly');
                area.style.opacity = '1';
                area.style.flex = '1'; // 铺满剩余高度
                area.style.fontSize = '18px'; // 字体拉大
                area.style.lineHeight = '1.6';
                area.style.background = '#000';
                area.style.color = '#fff';
                area.style.marginTop = '20px';
                
                editBtn.style.display = 'none';
                saveBtn.style.display = 'inline-block';
                area.focus();
            });
            
            const exitZenMode = () => {
                backdrop.style.display = 'none';
                // 还原容器样式
                container.style.position = '';
                container.style.top = '';
                container.style.left = '';
                container.style.transform = '';
                container.style.width = '';
                container.style.height = '';
                container.style.zIndex = '';
                container.style.background = '';
                container.style.padding = '';
                container.style.borderRadius = '';
                container.style.boxShadow = '';
                container.style.border = '';
                container.style.display = '';
                container.style.flexDirection = '';

                area.setAttribute('readonly', 'true');
                area.style.opacity = '0.7';
                area.style.flex = '';
                area.style.height = '';
                area.style.fontSize = '12px';
                area.rows = 3;
                saveBtn.style.display = 'none';
                editBtn.style.display = 'inline-block';
            };

            saveBtn.addEventListener('click', () => {
                // 保存逻辑
                if (textAreaId === 'custom-prompt') {
                    const currentId = window.appConfig.promptContext || 'general';
                    window.appConfig.prompts[currentId] = area.value.trim();
                } else if (textAreaId === 'global-json-prompt') {
                    window.appConfig.globalJsonTemplate = area.value.trim();
                }
                
                chrome.storage.local.set({ app_config: window.appConfig }, () => {
                    window.showStatus('💾 已安全保存并应用', highlightColor);
                    exitZenMode();
                });
            });

            // 点击背景也可退出
            backdrop.addEventListener('click', exitZenMode);
        }
    }

    bindEditMode('custom-prompt', 'edit-prompt-btn', 'save-prompt-btn', '#38bdf8', 12);
    bindEditMode('global-json-prompt', 'edit-global-json-btn', 'save-global-json-btn', '#a855f7', 15);
};