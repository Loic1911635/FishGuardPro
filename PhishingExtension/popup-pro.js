// popup-pro.js - Version professionnelle avec support multilingue
document.addEventListener("DOMContentLoaded", async function () {
    // Éléments du DOM
    const scanPageButton = document.getElementById("scanPageButton");
    const scanLinkButton = document.getElementById("scanLinkButton");
    const resultDiv = document.getElementById("result");
    const urlInput = document.getElementById("urlInput");
    const languageSelector = document.getElementById("languageSelector");
    
    // Charger la langue sauvegardée
    const currentLang = await getCurrentLanguage();
    languageSelector.value = currentLang;
    
    // Appliquer les traductions
    await applyTranslations();
    
    // Gestion du changement de langue
    languageSelector.addEventListener('change', async (e) => {
        await setLanguage(e.target.value);
        await applyTranslations();
    });
    
    // Fonction pour appliquer les traductions
    async function applyTranslations() {
        const elements = document.querySelectorAll('[data-i18n]');
        for (const element of elements) {
            const key = element.getAttribute('data-i18n');
            element.textContent = await t(key);
        }
        
        // Traductions des placeholders
        const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
        for (const element of placeholderElements) {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = await t(key);
        }
    }
    
    // Fonction de validation d'URL
    function isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }
    
    // Fonction pour afficher les erreurs
    async function showError(message) {
        resultDiv.className = 'warning';
        resultDiv.innerHTML = `<strong>${message}</strong>`;
    }
    
    // Fonction pour réinitialiser l'affichage
    function resetDisplay() {
        resultDiv.innerHTML = "";
        resultDiv.className = "";
    }
    
    // Scanner la page actuelle
    scanPageButton.addEventListener("click", async function () {
        resetDisplay();
        const trans = await getTranslations();
        resultDiv.innerHTML = `<span class="loading">${trans.scanning}</span>`;
        resultDiv.className = '';
        
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const currentUrl = tabs[0].url;
            
            if (!isValidUrl(currentUrl)) {
                showError(trans.scanError);
                return;
            }
            
            chrome.runtime.sendMessage({ action: "scanURL", url: currentUrl }, async function (response) {
                await displayResult(response, currentUrl);
            });
        });
    });
    
    // Scanner le lien collé
    scanLinkButton.addEventListener("click", async function () {
        resetDisplay();
        let url = urlInput.value.trim();
        const trans = await getTranslations();
        
        if (!url) {
            showError(trans.enterUrl);
            return;
        }
        
        // Ajouter https:// si absent
        if (!url.match(/^https?:\/\//)) {
            url = "https://" + url;
        }
        
        // Validation de l'URL
        if (!isValidUrl(url)) {
            showError(trans.scanError);
            return;
        }
        
        resultDiv.innerHTML = `<span class="loading">${trans.scanning}</span>`;
        resultDiv.className = '';
        
        chrome.runtime.sendMessage({ action: "scanURL", url: url }, async function (response) {
            await displayResult(response, url);
        });
    });
    
    // Fonction d'affichage des résultats
    async function displayResult(response, url) {
        const trans = await getTranslations();
        
        if (!response) {
            resultDiv.className = 'danger';
            resultDiv.innerHTML = `<strong>${trans.scanError}</strong>`;
            return;
        }
        
        // Site en liste blanche
        if (response.whitelisted) {
            resultDiv.className = 'trusted';
            resultDiv.innerHTML = `<strong>${trans.siteWhitelisted}</strong>`;
            
            try {
                const urlObj = new URL(url);
                resultDiv.innerHTML += `<div class="detail"><span class="detail-label">${trans.domain}:</span> ${urlObj.hostname}</div>`;
            } catch (e) {
                // Ignorer
            }
        }
        // Erreur lors de la vérification
        else if (response.error || response.isPhishing === null) {
            resultDiv.className = 'warning';
            resultDiv.innerHTML = `<strong>${trans.scanError}</strong>`;
            resultDiv.innerHTML += `<div class="detail">${trans.beCautious}</div>`;
            
            if (response.message) {
                resultDiv.innerHTML += `<div class="detail">${response.message}</div>`;
            }
        }
        // Site dangereux détecté
        else if (response.isPhishing) {
            resultDiv.className = 'danger';
            resultDiv.innerHTML = `<strong>${trans.siteDangerous}</strong>`;
            
            // Type de menace
            if (response.threatType) {
                const threatName = trans[response.threatType] || response.threatType;
                resultDiv.innerHTML += `<div class="detail"><span class="detail-label">${trans.threatType}:</span> ${threatName}</div>`;
            }
            
            // Score de risque
            if (response.threatScore) {
                resultDiv.innerHTML += `<div class="detail"><span class="detail-label">${trans.riskScore}:</span> ${response.threatScore}%</div>`;
            }
            
            // Avertissement
            resultDiv.innerHTML += `<div class="detail" style="margin-top: 8px; font-weight: 500;">${trans.doNotEnterInfo}</div>`;
        }
        // Site sûr
        else {
            resultDiv.className = 'safe';
            resultDiv.innerHTML = `<strong>${trans.siteSafe}</strong>`;
            
            // Domaine vérifié
            try {
                const urlObj = new URL(url);
                resultDiv.innerHTML += `<div class="detail"><span class="detail-label">${trans.domain}:</span> ${urlObj.hostname}</div>`;
                
                // Bouton liste blanche
                const whitelistBtn = document.createElement('button');
                whitelistBtn.className = 'btn-whitelist';
                whitelistBtn.textContent = trans.addToWhitelist;
                whitelistBtn.onclick = () => {
                    chrome.runtime.sendMessage({ action: "addToWhitelist", url: url }, () => {
                        whitelistBtn.textContent = trans.added;
                        whitelistBtn.disabled = true;
                    });
                };
                resultDiv.appendChild(whitelistBtn);
            } catch (e) {
                // Ignorer
            }
        }
        
        // Source de vérification
        if (response.source) {
            resultDiv.innerHTML += `<div class="detail"><span class="detail-label">${trans.source}:</span> ${response.source}</div>`;
        }
        
        // Heure de vérification
        const now = new Date();
        const timeString = now.toLocaleTimeString(currentLang === 'fr' ? 'fr-FR' : 'en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        resultDiv.innerHTML += `<div class="detail"><span class="detail-label">${trans.verifiedAt}:</span> ${timeString}</div>`;
    }
    
    // Navigation
    document.getElementById('historyBtn').addEventListener('click', () => {
        const historyUrl = chrome.runtime.getURL('history.html');
        chrome.tabs.create({ url: historyUrl });
    });
    
    // Debug link (triple click to show)
    let debugClicks = 0;
    document.getElementById('debugLink').addEventListener('click', (e) => {
        e.preventDefault();
        debugClicks++;
        if (debugClicks >= 3) {
            const debugUrl = chrome.runtime.getURL('debug.html');
            chrome.tabs.create({ url: debugUrl });
            debugClicks = 0;
        }
        setTimeout(() => { debugClicks = 0; }, 1000);
    });
    
    // Permettre la vérification avec Enter
    urlInput.addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            scanLinkButton.click();
        }
    });
    
    // Focus automatique
    urlInput.focus();
});