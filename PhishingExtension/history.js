// history.js - VERSION CORRIGÉE
// Language handling
async function initLanguage() {
    const currentLang = await getCurrentLanguage();
    document.getElementById('languageSelector').value = currentLang;
    await applyTranslations();
}

async function applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    for (const element of elements) {
        const key = element.getAttribute('data-i18n');
        element.textContent = await t(key);
    }
    
    // Translate placeholders
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    for (const element of placeholderElements) {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = await t(key);
    }
}

// Tab management
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs and panes
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        // Activate clicked tab
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        // Load tab data
        if (tabId === 'history') {
            loadHistory();
        } else if (tabId === 'whitelist') {
            loadWhitelist();
        } else if (tabId === 'stats') {
            loadStats();
        }
    });
});

// Language selector
document.getElementById('languageSelector').addEventListener('change', async (e) => {
    await setLanguage(e.target.value);
    await applyTranslations();
    // Reload current tab to update content
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        activeTab.click();
    }
});

// Back button
document.getElementById('backToPopup').addEventListener('click', () => {
    window.close();
});

// Load history
async function loadHistory() {
    chrome.runtime.sendMessage({ action: "getHistory" }, async (history) => {
        const historyList = document.getElementById('historyList');
        const lang = await getCurrentLanguage();
        const trans = await getTranslations();
        
        if (!history || history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <h3>${trans.noHistory}</h3>
                    <p>${trans.noHistoryDesc}</p>
                </div>
            `;
            return;
        }
        
        historyList.innerHTML = await Promise.all(history.map(async (entry, index) => {
            const date = new Date(entry.timestamp);
            const dateStr = date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US');
            const timeStr = date.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            let statusClass = 'safe';
            let statusText = trans.safe;
            let itemClass = 'safe';
            
            if (entry.result.whitelisted) {
                statusClass = 'whitelisted';
                statusText = trans.whitelisted;
                itemClass = 'whitelisted';
            } else if (entry.result.error) {
                statusClass = 'error';
                statusText = trans.error;
                itemClass = '';
            } else if (entry.result.isPhishing) {
                statusClass = 'danger';
                statusText = trans.dangerous;
                itemClass = 'dangerous';
            }
            
            let threatDetails = '';
            if (entry.result.threatType && entry.result.threatType !== 'SAFE') {
                const threatName = trans[entry.result.threatType] || entry.result.threatType;
                threatDetails += `<div>${trans.type}: ${threatName}</div>`;
            }
            if (entry.result.source) {
                threatDetails += `<div>${trans.source}: ${entry.result.source}</div>`;
            }
            if (entry.result.threatScore) {
                threatDetails += `<div>${trans.score}: ${entry.result.threatScore}%</div>`;
            }
            
            // Utiliser un identifiant unique pour chaque bouton
            const buttonId = `whitelist-btn-${index}`;
            
            return `
                <div class="history-item ${itemClass}">
                    <div class="history-header">
                        <div class="url">${escapeHtml(entry.url)}</div>
                        <div class="timestamp">${dateStr} ${timeStr}</div>
                    </div>
                    <div class="result">
                        <span class="status ${statusClass}">${statusText}</span>
                        ${entry.result.whitelisted ? '' : `<button class="btn btn-primary btn-small" id="${buttonId}" data-url="${escapeHtml(entry.url)}">${trans.addToWhitelist}</button>`}
                    </div>
                    ${threatDetails ? `<div class="threat-details">${threatDetails}</div>` : ''}
                </div>
            `;
        })).then(items => items.join(''));
        
        // Ajouter les event listeners après que le HTML soit inséré
        history.forEach((entry, index) => {
            if (!entry.result.whitelisted) {
                const button = document.getElementById(`whitelist-btn-${index}`);
                if (button) {
                    button.addEventListener('click', function() {
                        const url = this.getAttribute('data-url');
                        chrome.runtime.sendMessage({ action: "addToWhitelist", url: url }, () => {
                            loadHistory(); // Recharger l'historique
                        });
                    });
                }
            }
        });
    });
}

// Load whitelist
async function loadWhitelist() {
    chrome.runtime.sendMessage({ action: "getWhitelist" }, async (whitelist) => {
        const whitelistList = document.getElementById('whitelistList');
        const trans = await getTranslations();
        
        if (!whitelist || whitelist.length === 0) {
            whitelistList.innerHTML = `
                <div class="empty-state">
                    <h3>${trans.noWhitelist}</h3>
                    <p>${trans.noWhitelistDesc}</p>
                </div>
            `;
            return;
        }
        
        whitelistList.innerHTML = whitelist.map((domain, index) => {
            const buttonId = `remove-btn-${index}`;
            return `
                <div class="whitelist-item">
                    <span class="domain-name">${escapeHtml(domain)}</span>
                    <button class="btn btn-danger btn-small" id="${buttonId}" data-domain="${escapeHtml(domain)}">${trans.remove}</button>
                </div>
            `;
        }).join('');
        
        // Ajouter les event listeners
        whitelist.forEach((domain, index) => {
            const button = document.getElementById(`remove-btn-${index}`);
            if (button) {
                button.addEventListener('click', async function() {
                    const domainToRemove = this.getAttribute('data-domain');
                    const trans = await getTranslations();
                    if (confirm(trans.confirmRemove || `Remove ${domainToRemove} from whitelist?`)) {
                        chrome.runtime.sendMessage({ action: "removeFromWhitelist", url: `https://${domainToRemove}` }, () => {
                            loadWhitelist(); // Recharger la whitelist
                        });
                    }
                });
            }
        });
    });
}

// Load statistics
async function loadStats() {
    chrome.runtime.sendMessage({ action: "getHistory" }, async (history) => {
        if (!history) history = [];
        
        const totalScans = history.length;
        const dangerousSites = history.filter(h => h.result.isPhishing).length;
        const safeSites = history.filter(h => !h.result.isPhishing && !h.result.error).length;
        
        document.getElementById('totalScans').textContent = totalScans;
        document.getElementById('dangerousSites').textContent = dangerousSites;
        document.getElementById('safeSites').textContent = safeSites;
        
        // Draw threat chart
        drawThreatChart(history);
    });
}

// Draw threat distribution chart
async function drawThreatChart(history) {
    const canvas = document.getElementById('threatChart');
    const ctx = canvas.getContext('2d');
    const trans = await getTranslations();
    
    // Count threat types
    const threatTypes = {};
    history.forEach(entry => {
        if (entry.result.threatType) {
            const type = entry.result.threatType;
            threatTypes[type] = (threatTypes[type] || 0) + 1;
        }
    });
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Color scheme
    const colors = {
        'SAFE': '#28a745',
        'SUSPICIOUS_URL': '#ffc107',
        'HIGH_RISK_PHISHING': '#dc3545',
        'CONFIRMED_PHISHING': '#dc3545',
        'MALWARE': '#6f42c1',
        'SOCIAL_ENGINEERING': '#e83e8c'
    };
    
    const entries = Object.entries(threatTypes);
    if (entries.length === 0) {
        ctx.fillStyle = '#6c757d';
        ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.fillText(trans.noData || 'No data to display', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Calculate dimensions
    const padding = 40;
    const barWidth = (canvas.width - padding * 2) / entries.length * 0.7;
    const maxCount = Math.max(...Object.values(threatTypes));
    const scale = (canvas.height - padding * 2) / maxCount;
    
    // Draw bars
    entries.forEach(([type, count], index) => {
        const barHeight = count * scale;
        const x = padding + index * ((canvas.width - padding * 2) / entries.length) + (canvas.width - padding * 2) / entries.length * 0.15;
        const y = canvas.height - padding - barHeight;
        
        // Draw bar
        ctx.fillStyle = colors[type] || '#6c757d';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // Draw count
        ctx.fillStyle = '#333';
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.fillText(count, x + barWidth / 2, y - 5);
        
        // Draw label
        ctx.save();
        ctx.translate(x + barWidth / 2, canvas.height - padding + 15);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#6c757d';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial';
        ctx.textAlign = 'right';
        const label = trans[type] || type;
        ctx.fillText(label, 0, 0);
        ctx.restore();
    });
}

// Clear history
document.getElementById('clearHistory').addEventListener('click', async () => {
    const trans = await getTranslations();
    if (confirm(trans.confirmClearHistory || 'Are you sure you want to clear all history?')) {
        chrome.runtime.sendMessage({ action: "clearHistory" }, () => {
            loadHistory();
        });
    }
});

// Add to whitelist
document.getElementById('addWhitelist').addEventListener('click', async () => {
    const input = document.getElementById('whitelistInput');
    let domain = input.value.trim();
    const trans = await getTranslations();
    
    if (!domain) {
        alert(trans.enterDomain || 'Please enter a domain');
        return;
    }
    
    // Clean domain
    domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    
    chrome.runtime.sendMessage({ action: "addToWhitelist", url: `https://${domain}` }, () => {
        input.value = '';
        loadWhitelist();
    });
});

// Allow adding with Enter
document.getElementById('whitelistInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('addWhitelist').click();
    }
});

// Reset badge - CORRIGÉ
document.getElementById('resetBadge').addEventListener('click', async () => {
    const trans = await getTranslations();
    chrome.runtime.sendMessage({ action: "resetThreatCount" }, (response) => {
        if (response && response.success) {
            alert(trans.counterReset || 'Threat counter reset!');
        }
    });
});

// Escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    await initLanguage();
    loadHistory();
});0