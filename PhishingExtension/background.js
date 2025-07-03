// background.js - Version corrigée avec détection améliorée

// Cache pour stocker les résultats
const urlCache = new Map();
const CACHE_DURATION = 3600000; // 1 heure

// Compteur de menaces pour le badge
let threatCount = 0;

// Gestionnaire de listes de phishing publiques
let phishingListsManager = null;

// Au démarrage, charger le compteur de menaces et initialiser les listes
chrome.runtime.onInstalled.addListener(async () => {
    console.log('🚀 FishGuard Pro installed/updated - initializing...');
    console.log('📋 To debug, open chrome://extensions → Service Worker → Inspect');
    console.log('🔍 Available commands: getListsStats(), checkPhishingUrl("URL"), diagnoseUrl("URL")');
    
    // Charger le compteur
    chrome.storage.local.get(['threatCount'], (result) => {
        threatCount = result.threatCount || 0;
        updateBadge();
    });
    
    // Initialiser le gestionnaire de listes immédiatement
    await initPhishingLists();
});

// Aussi initialiser au démarrage du service worker
console.log('🔄 Service worker starting...');
initPhishingLists().catch(console.error);

// Initialiser les listes de phishing
async function initPhishingLists() {
    console.log('Initializing public phishing lists...');
    
    phishingListsManager = {
        phishingUrls: new Set(),
        phishingDomains: new Set(),
        lastUpdate: {},
        
        async init() {
            console.log('PhishingListsManager initializing...');
            
            // Charger les listes stockées
            const stored = await new Promise(resolve => {
                chrome.storage.local.get(['phishingLists'], result => {
                    resolve(result.phishingLists || null);
                });
            });
            
            if (stored && stored.lastSave && (Date.now() - stored.lastSave < 6 * 60 * 60 * 1000)) {
                // Utiliser les données stockées si elles ont moins de 6 heures
                this.phishingUrls = new Set(stored.urls || []);
                this.phishingDomains = new Set(stored.domains || []);
                this.lastUpdate = stored.lastUpdate || {};
                console.log(`Loaded cached lists: ${this.phishingUrls.size} URLs, ${this.phishingDomains.size} domains`);
                
                // Si le cache est vide ou très petit, forcer une mise à jour
                if (this.phishingUrls.size < 100) {
                    console.log('Cache seems empty or too small, forcing update...');
                    await this.updateLists();
                }
            } else {
                // Sinon, télécharger les nouvelles listes
                console.log('No valid cache found, downloading lists...');
                await this.updateLists();
            }
        },
        
        async updateLists() {
            console.log('Downloading phishing lists...');
            
            // 1. OpenPhish (format texte simple)
            try {
                console.log('Fetching OpenPhish...');
                const response = await fetch('https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt');
                const text = await response.text();
                const urls = text.split('\n').filter(url => url.trim() && !url.startsWith('#'));
                
                // Debug: vérifier si nos URLs cibles sont dans la liste
                const targetUrls = [
                    'vcvgdtwtuo.duckdns.org',
                    'overlook-local-manage-idd3520842196.vercel.app',
                    'meveipreupreiloi-1079-64892810-projects.vercel.app',
                    'd49e8b53c2f1.godaddysites.com'
                ];
                
                for (const target of targetUrls) {
                    const found = urls.some(url => url.includes(target));
                    console.log(`Target "${target}" in OpenPhish: ${found}`);
                }
                
                urls.forEach(url => this.addUrl(url));
                console.log(`OpenPhish: ${urls.length} URLs loaded`);
                console.log('Sample URLs from OpenPhish:', urls.slice(0, 5));
            } catch (e) {
                console.error('Error fetching OpenPhish:', e);
            }
            
            // 2. URLhaus (format texte avec commentaires)
            try {
                console.log('Fetching URLhaus...');
                const response = await fetch('https://urlhaus.abuse.ch/downloads/text_online/');
                const text = await response.text();
                const lines = text.split('\n').filter(line => !line.startsWith('#') && line.trim());
                lines.forEach(url => this.addUrl(url));
                console.log(`URLhaus: ${lines.length} URLs loaded`);
            } catch (e) {
                console.error('Error fetching URLhaus:', e);
            }
            
            // 3. PhishTank (format JSON)
            try {
                console.log('Fetching PhishTank JSON...');
                const response = await fetch('https://data.phishtank.com/data/online-valid.json');
                const data = await response.json();
                let count = 0;
                data.forEach(entry => {
                    if (entry.url && entry.verified === 'yes' && entry.online === 'yes') {
                        this.addUrl(entry.url);
                        count++;
                    }
                });
                console.log(`PhishTank: ${count} verified URLs loaded`);
            } catch (e) {
                console.error('Error fetching PhishTank:', e);
            }
            
            // 4. URLhaus CSV (format CSV pour plus de détails)
            try {
                console.log('Fetching URLhaus CSV...');
                const response = await fetch('https://urlhaus.abuse.ch/downloads/csv_online/');
                const text = await response.text();
                const lines = text.split('\n').slice(9); // Skip header lines
                let count = 0;
                lines.forEach(line => {
                    if (line.trim()) {
                        const parts = line.split('","');
                        if (parts[2]) { // URL is in the 3rd column
                            const url = parts[2].replace(/"/g, '');
                            if (url && url.startsWith('http')) {
                                this.addUrl(url);
                                count++;
                            }
                        }
                    }
                });
                console.log(`URLhaus CSV: ${count} URLs processed`);
            } catch (e) {
                console.error('Error fetching URLhaus CSV:', e);
            }
            
            // Sauvegarder et indiquer que les listes sont prêtes
            await this.saveData();
            console.log(`✅ LISTS READY - Total loaded: ${this.phishingUrls.size} URLs, ${this.phishingDomains.size} domains`);
            
            // Notification que les listes sont prêtes
            chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                title: 'FishGuard Pro Ready',
                message: `Phishing database loaded: ${this.phishingUrls.size} URLs`,
                priority: 1
            });
        },
        
        addUrl(url) {
            url = url.trim();
            if (!url) return;
            
            // Log pour debug des URLs problématiques
            if (url.includes('godaddysites.com') || url.includes('vercel.app') || url.includes('duckdns.org')) {
                console.log('🎯 ADDING IMPORTANT URL:', url);
            }
            
            // Ajouter l'URL exacte telle quelle (sans modification)
            this.phishingUrls.add(url);
            
            // Ajouter aussi en minuscules
            const lowerUrl = url.toLowerCase();
            this.phishingUrls.add(lowerUrl);
            
            // Si l'URL se termine par un fichier, ajouter aussi sans le fichier
            const fileExtensions = ['.html', '.htm', '.php', '.aspx', '.jsp'];
            let hasFile = false;
            for (const ext of fileExtensions) {
                if (lowerUrl.endsWith(ext) || lowerUrl.includes(ext + '/')) {
                    hasFile = true;
                    break;
                }
            }
            
            // Ajouter variantes avec/sans slash final (sauf pour les fichiers)
            if (!hasFile) {
                if (url.endsWith('/')) {
                    this.phishingUrls.add(url.slice(0, -1));
                    this.phishingUrls.add(lowerUrl.slice(0, -1));
                } else {
                    this.phishingUrls.add(url + '/');
                    this.phishingUrls.add(lowerUrl + '/');
                }
            }
            
            // Ajouter variantes http/https
            if (url.startsWith('https://')) {
                const httpVersion = url.replace('https://', 'http://');
                this.phishingUrls.add(httpVersion);
                this.phishingUrls.add(httpVersion.toLowerCase());
            } else if (url.startsWith('http://')) {
                const httpsVersion = url.replace('http://', 'https://');
                this.phishingUrls.add(httpsVersion);
                this.phishingUrls.add(httpsVersion.toLowerCase());
            }
            
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname.toLowerCase();
                const path = urlObj.pathname;
                
                // Ajouter le domaine
                this.phishingDomains.add(domain);
                
                // Log pour debug
                if (domain.includes('godaddysites.com') || domain.includes('vercel.app') || domain.includes('duckdns.org')) {
                    console.log('🎯 ADDING DOMAIN:', domain);
                }
                
                // Ajouter variantes du domaine
                if (domain.startsWith('www.')) {
                    this.phishingDomains.add(domain.substring(4));
                } else {
                    this.phishingDomains.add('www.' + domain);
                }
                
                // Ajouter l'URL complète normalisée
                const normalizedFull = urlObj.protocol + '//' + domain + path;
                this.phishingUrls.add(normalizedFull);
                this.phishingUrls.add(normalizedFull.toLowerCase());
                
                // Pour les URLs avec fichiers, ajouter aussi le chemin sans le fichier
                if (hasFile && path !== '/') {
                    const pathWithoutFile = path.substring(0, path.lastIndexOf('/') + 1);
                    const urlWithoutFile = urlObj.protocol + '//' + domain + pathWithoutFile;
                    this.phishingUrls.add(urlWithoutFile);
                    this.phishingUrls.add(urlWithoutFile.toLowerCase());
                }
                
                // Ajouter aussi juste le domaine + path (sans protocole)
                const domainPath = domain + path;
                this.phishingUrls.add(domainPath);
                this.phishingUrls.add('http://' + domainPath);
                this.phishingUrls.add('https://' + domainPath);
                
            } catch (e) {
                console.warn('Invalid URL:', url, e);
            }
        },
        
        checkUrl(url) {
            if (!url) return { isPhishing: false };
            
            console.log(`=== CHECKING URL IN LISTS ===`);
            console.log(`Input URL: ${url}`);
            console.log(`Database size: ${this.phishingUrls.size} URLs, ${this.phishingDomains.size} domains`);
            
            // Créer toutes les variantes possibles de l'URL
            const urlVariants = createUrlVariants(url);
            
            console.log('Checking', urlVariants.size, 'variants...');
            
            // 1. Vérifier toutes les variantes pour une correspondance exacte
            for (const variant of urlVariants) {
                if (this.phishingUrls.has(variant)) {
                    console.log(`✅ EXACT MATCH FOUND: ${variant}`);
                    return {
                        isPhishing: true,
                        source: 'Public phishing lists (exact match)',
                        confidence: 100,
                        threatType: 'CONFIRMED_PHISHING'
                    };
                }
            }
            
            // 2. Vérifier le domaine et le chemin de manière plus flexible
            try {
                const normalizedUrl = url.toLowerCase().trim();
                const urlWithProtocol = normalizedUrl.startsWith('http') ? normalizedUrl : 'http://' + normalizedUrl;
                const urlObj = new URL(urlWithProtocol);
                const domain = urlObj.hostname.toLowerCase();
                const path = normalizePath(urlObj.pathname.toLowerCase());
                
                console.log(`Domain: ${domain}, Path: ${path}`);
                
                // Vérifier si le domaine exact est dans la liste
                if (this.phishingDomains.has(domain)) {
                    console.log('✅ DOMAIN MATCH FOUND!');
                    
                    // Si on a le domaine, chercher si on a aussi l'URL complète
                    let exactUrlMatch = false;
                    for (const storedUrl of this.phishingUrls) {
                        if (storedUrl.includes(domain + path)) {
                            exactUrlMatch = true;
                            break;
                        }
                    }
                    
                    return {
                        isPhishing: true,
                        source: exactUrlMatch ? 'Public phishing lists (exact URL)' : 'Public phishing lists (domain)',
                        confidence: exactUrlMatch ? 100 : 95,
                        threatType: 'CONFIRMED_PHISHING'
                    };
                }
                
                // 3. Recherche plus approfondie pour les URLs avec le même domaine
                console.log('Searching for URLs with same domain...');
                const domainMatches = [];
                
                for (const storedUrl of this.phishingUrls) {
                    if (storedUrl.includes(domain)) {
                        try {
                            const storedUrlParsed = storedUrl.startsWith('http') ? storedUrl : 'http://' + storedUrl;
                            const storedUrlObj = new URL(storedUrlParsed);
                            
                            if (storedUrlObj.hostname.toLowerCase() === domain) {
                                const storedPath = normalizePath(storedUrlObj.pathname.toLowerCase());
                                domainMatches.push({ url: storedUrl, path: storedPath });
                                
                                // Vérifier si les chemins correspondent
                                if (storedPath === path || 
                                    storedPath === path + '/' || 
                                    storedPath + '/' === path ||
                                    (path.includes('.html') && storedPath === path.replace('.html/', '.html'))) {
                                    console.log(`✅ EXACT PATH MATCH: ${storedUrl}`);
                                    return {
                                        isPhishing: true,
                                        source: 'Public phishing lists (URL match)',
                                        confidence: 100,
                                        threatType: 'CONFIRMED_PHISHING'
                                    };
                                }
                            }
                        } catch (e) {
                            // Ignorer les URLs mal formées
                        }
                    }
                }
                
                if (domainMatches.length > 0) {
                    console.log(`Found ${domainMatches.length} URLs with same domain:`, domainMatches.slice(0, 3));
                    
                    // Si on a trouvé des URLs avec le même domaine mais pas le même chemin,
                    // c'est quand même suspect car le domaine est dans la liste de phishing
                    return {
                        isPhishing: true,
                        source: 'Public phishing lists (domain in phishing list)',
                        confidence: 90,
                        threatType: 'CONFIRMED_PHISHING'
                    };
                }
                
                // 4. Vérifier les variantes du domaine
                const domainWithoutWww = domain.replace(/^www\./, '');
                if (this.phishingDomains.has(domainWithoutWww)) {
                    console.log('✅ DOMAIN MATCH FOUND (without www)!');
                    return {
                        isPhishing: true,
                        source: 'Public phishing lists (domain)',
                        confidence: 95,
                        threatType: 'CONFIRMED_PHISHING'
                    };
                }
                
                if (!domain.startsWith('www.') && this.phishingDomains.has('www.' + domain)) {
                    console.log('✅ DOMAIN MATCH FOUND (with www)!');
                    return {
                        isPhishing: true,
                        source: 'Public phishing lists (domain)',
                        confidence: 95,
                        threatType: 'CONFIRMED_PHISHING'
                    };
                }
                
            } catch (e) {
                console.error('Error parsing URL:', e);
            }
            
            console.log('❌ No match found in public lists');
            return { isPhishing: false };
        },
        
        async saveData() {
            console.log('Saving phishing lists to storage...');
            
            // Convertir les Sets en Arrays pour le stockage
            const urlsArray = Array.from(this.phishingUrls);
            const domainsArray = Array.from(this.phishingDomains);
            
            // Ne garder que les 20k dernières URLs pour éviter de dépasser les limites
            const data = {
                urls: urlsArray.slice(-20000),
                domains: domainsArray,
                lastUpdate: Date.now(),
                lastSave: Date.now(),
                counts: {
                    totalUrls: urlsArray.length,
                    totalDomains: domainsArray.length,
                    savedUrls: Math.min(urlsArray.length, 20000),
                    savedDomains: domainsArray.length
                }
            };
            
            chrome.storage.local.set({ phishingLists: data }, () => {
                console.log(`Saved ${data.counts.savedUrls} URLs and ${data.counts.savedDomains} domains to storage`);
                if (data.counts.totalUrls > data.counts.savedUrls) {
                    console.warn(`Note: Only saved last ${data.counts.savedUrls} URLs out of ${data.counts.totalUrls} total`);
                }
            });
        }
    };
    
    await phishingListsManager.init();
    
    // Mise à jour automatique toutes les 6 heures
    setInterval(() => {
        phishingListsManager.updateLists();
    }, 6 * 60 * 60 * 1000);
}

// Fonction utilitaire pour normaliser les chemins
function normalizePath(path) {
    // Enlever les doubles slashes
    path = path.replace(/\/+/g, '/');
    
    // Pour les chemins avec fichiers HTML, gérer le slash final de manière cohérente
    if (path.includes('.html') || path.includes('.htm') || path.includes('.php')) {
        // Ne pas ajouter de slash après un fichier
        if (path.endsWith('/')) {
            path = path.slice(0, -1);
        }
    }
    
    return path;
}

// Fonction utilitaire pour créer toutes les variantes d'une URL
function createUrlVariants(url) {
    const variants = new Set();
    const normalized = url.toLowerCase().trim();
    
    // Ajouter l'URL de base
    variants.add(normalized);
    
    // S'assurer qu'il y a un protocole
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        variants.add('http://' + normalized);
        variants.add('https://' + normalized);
    }
    
    // Variantes http/https
    if (normalized.startsWith('https://')) {
        variants.add(normalized.replace('https://', 'http://'));
    } else if (normalized.startsWith('http://')) {
        variants.add(normalized.replace('http://', 'https://'));
    }
    
    // Pour chaque variante actuelle, ajouter avec/sans slash (si pas de fichier)
    const currentVariants = Array.from(variants);
    const hasFile = normalized.match(/\.(html?|php|aspx?|jsp)($|\/)/i);
    
    if (!hasFile) {
        for (const v of currentVariants) {
            if (v.endsWith('/')) {
                variants.add(v.slice(0, -1));
            } else {
                variants.add(v + '/');
            }
        }
    }
    
    return variants;
}

// Gestionnaire de messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scanURL") {
        const url = request.url;
        
        console.log('=== SCAN REQUEST ===');
        console.log('URL:', url);
        
        // Vérifier la liste blanche
        checkWhitelist(url).then(isWhitelisted => {
            if (isWhitelisted) {
                console.log("URL in whitelist:", url);
                const result = { 
                    isPhishing: false,
                    whitelisted: true 
                };
                saveToHistory(url, result);
                sendResponse(result);
            } else {
                // Utiliser le cache et vérifier
                checkPhishingWithCache(url)
                    .then((result) => {
                        saveToHistory(url, result);
                        if (result.isPhishing) {
                            incrementThreatCount();
                        }
                        sendResponse(result);
                    })
                    .catch((error) => {
                        console.error("Error checking URL:", error);
                        const result = { 
                            isPhishing: null, 
                            error: true,
                            message: error.message 
                        };
                        saveToHistory(url, result);
                        sendResponse(result);
                    });
            }
        });
        
        return true; // Indique une réponse async
    }
    
    // Autres actions (historique, liste blanche, etc.)
    if (request.action === "getHistory") {
        getHistory().then(history => sendResponse(history));
        return true;
    }
    
    if (request.action === "clearHistory") {
        clearHistory().then(() => sendResponse({ success: true }));
        return true;
    }
    
    if (request.action === "addToWhitelist") {
        addToWhitelist(request.url).then(() => sendResponse({ success: true }));
        return true;
    }
    
    if (request.action === "removeFromWhitelist") {
        removeFromWhitelist(request.url).then(() => sendResponse({ success: true }));
        return true;
    }
    
    if (request.action === "getWhitelist") {
        getWhitelist().then(whitelist => sendResponse(whitelist));
        return true;
    }
    
    if (request.action === "resetThreatCount") {
        resetThreatCount();
        sendResponse({ success: true });
    }
    
    if (request.action === "debug") {
        handleDebugCommand(request, sendResponse);
        return true;
    }
});

// Gestionnaire pour les commandes de debug
function handleDebugCommand(request, sendResponse) {
    const { command, url, keyword } = request;
    
    switch (command) {
        case "getStats":
            if (phishingListsManager) {
                sendResponse({
                    stats: {
                        urls: phishingListsManager.phishingUrls.size,
                        domains: phishingListsManager.phishingDomains.size
                    }
                });
            } else {
                sendResponse({ error: "Lists not initialized" });
            }
            break;
            
        case "checkUrl":
            if (phishingListsManager) {
                const result = phishingListsManager.checkUrl(url);
                sendResponse({ debug: result });
            } else {
                sendResponse({ error: "Lists not initialized" });
            }
            break;
            
        case "search":
            if (phishingListsManager) {
                const results = {
                    urls: [],
                    domains: []
                };
                
                const searchKey = keyword.toLowerCase();
                for (const storedUrl of phishingListsManager.phishingUrls) {
                    if (storedUrl.includes(searchKey)) {
                        results.urls.push(storedUrl);
                    }
                }
                
                for (const domain of phishingListsManager.phishingDomains) {
                    if (domain.includes(searchKey)) {
                        results.domains.push(domain);
                    }
                }
                
                sendResponse({ results });
            } else {
                sendResponse({ error: "Lists not initialized" });
            }
            break;
            
        case "forceUpdate":
            if (phishingListsManager) {
                phishingListsManager.updateLists().then(() => {
                    sendResponse({ success: true });
                });
                return true; // Async response
            } else {
                sendResponse({ error: "Lists not initialized" });
            }
            break;
            
        default:
            sendResponse({ error: "Unknown command" });
    }
}

// Fonction de vérification avec cache
async function checkPhishingWithCache(url) {
    console.log('=== CHECK WITH CACHE ===');
    console.log('Checking URL:', url);
    
    // Vérifier le cache
    const cached = urlCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log("Result from cache for:", url);
        return cached.result;
    }
    
    // Si pas en cache, faire la vérification complète
    console.log('Not in cache, performing full check...');
    const result = await checkPhishing(url);
    
    console.log('Final result:', result);
    
    // Stocker en cache seulement si ce n'est pas une erreur
    if (!result.error) {
        urlCache.set(url, {
            result,
            timestamp: Date.now()
        });
    }
    
    // Nettoyer le cache si trop grand
    if (urlCache.size > 100) {
        const oldestKey = urlCache.keys().next().value;
        urlCache.delete(oldestKey);
    }
    
    return result;
}

// Fonction principale de vérification
async function checkPhishing(url) {
    console.log('=== CHECKING PHISHING ===');
    console.log('URL to check:', url);
    
    // Attendre que les listes soient initialisées si nécessaire
    let retries = 0;
    while (!phishingListsManager && retries < 20) { // Attendre jusqu'à 10 secondes
        console.log('Waiting for phishing lists to initialize... (retry ' + retries + ')');
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
    }
    
    // 1. TOUJOURS vérifier d'abord les listes publiques
    if (phishingListsManager && phishingListsManager.phishingUrls.size > 0) {
        console.log("Checking public lists FIRST...");
        console.log("Lists contain", phishingListsManager.phishingUrls.size, "URLs");
        
        const publicListResult = phishingListsManager.checkUrl(url);
        console.log('Public list check result:', publicListResult);
        
        // Si trouvé dans les listes publiques, retourner immédiatement
        if (publicListResult.isPhishing) {
            console.log('FOUND IN PUBLIC LISTS - RETURNING IMMEDIATELY!');
            return publicListResult;
        }
    } else {
        console.error('Phishing lists manager not ready or empty!');
        console.log('Manager exists?', !!phishingListsManager);
        if (phishingListsManager) {
            console.log('URLs count:', phishingListsManager.phishingUrls.size);
            console.log('Domains count:', phishingListsManager.phishingDomains.size);
        }
    }
    
    // 2. Si pas trouvé dans les listes, vérifier avec les APIs si configurées
    const phishTankKey = await getStoredApiKey('phishtank');
    if (phishTankKey) {
        console.log("Checking PhishTank API...");
        const phishTankResult = await checkWithPhishTank(url, phishTankKey);
        if (phishTankResult.isPhishing) {
            return phishTankResult;
        }
    }
    
    const googleApiKey = await getStoredApiKey('google');
    if (googleApiKey) {
        console.log("Checking Google Safe Browsing...");
        const googleResult = await checkWithGoogleAPI(url, googleApiKey);
        if (googleResult.isPhishing) {
            return googleResult;
        }
    }
    
    // 3. En dernier recours, faire la détection locale
    console.log("No match in lists or APIs, using local detection...");
    const localResult = await checkPhishingLocal(url);
    
    return localResult;
}

// Détection locale de phishing (AMÉLIORÉE pour éviter les faux positifs)
async function checkPhishingLocal(url) {
    try {
        const urlLower = url.toLowerCase();
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();
        
        let threatScore = 0;
        let detectedPatterns = [];
        
        // Ne PAS marquer les grandes plateformes comme suspectes
        const majorPlatforms = [
            'google.com', 'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com',
            'linkedin.com', 'microsoft.com', 'apple.com', 'amazon.com', 'netflix.com',
            'spotify.com', 'github.com', 'stackoverflow.com', 'wikipedia.org', 'reddit.com'
        ];
        
        // Vérifier si c'est un domaine majeur ou un sous-domaine légitime
        for (const platform of majorPlatforms) {
            if (domain === platform || domain.endsWith('.' + platform)) {
                // C'est un domaine légitime, on ne fait que des vérifications minimales
                
                // Vérifier seulement les homographes évidents
                const suspiciousChars = /[а-яА-Я]|[αβγδεζηθικλμνξοπρστυφχψω]/; // Cyrillique ou grec
                if (suspiciousChars.test(domain)) {
                    threatScore = 100; // Homographe détecté sur un domaine majeur = très suspect
                    detectedPatterns.push("Homograph attack on major platform");
                }
                
                // Si pas d'homographe, c'est probablement sûr
                break;
            }
        }
        
        // Patterns suspects UNIQUEMENT pour les domaines non-majeurs
        if (threatScore === 0) {
            const suspiciousPatterns = [
                // IPs directes (toujours suspect)
                {
                    pattern: /^https?:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/,
                    score: 30,
                    name: "Direct IP address"
                },
                // URLs raccourcies (potentiellement suspect)
                {
                    pattern: /^https?:\/\/(bit\.ly|tinyurl|short\.link|cutt\.ly|t\.co|goo\.gl|ow\.ly|rebrand\.ly)/,
                    score: 15,
                    name: "URL shortener"
                },
                // Caractères suspects dans le domaine
                {
                    pattern: /@/,
                    score: 40,
                    name: "@ character in URL"
                },
                // Homographes (très suspect)
                {
                    pattern: /[а-яА-Я]|[αβγδεζηθικλμνξοπρστυφχψω]/,
                    score: 50,
                    name: "Cyrillic or Greek characters"
                },
                // TLDs très suspects
                {
                    pattern: /\.(tk|ml|ga|cf|click|download|webcam)(?:\/|$)/,
                    score: 25,
                    name: "Suspicious TLD"
                },
                // Domaines d'hébergement gratuit souvent utilisés pour le phishing
                {
                    pattern: /\.(000webhostapp\.com|herokuapp\.com|netlify\.app|surge\.sh|glitch\.me)(?:\/|$)/,
                    score: 20,
                    name: "Free hosting service"
                },
                // Nombreux tirets (modérément suspect)
                {
                    pattern: /[^\/]{3,}-[^\/]{3,}-[^\/]{3,}/,
                    score: 15,
                    name: "Multiple hyphens"
                },
                // Beaucoup de chiffres dans le domaine
                {
                    pattern: /[0-9]{6,}/,
                    score: 20,
                    name: "Many digits"
                }
            ];
            
            // Vérifier les patterns
            for (const { pattern, score, name } of suspiciousPatterns) {
                if (pattern.test(url) || pattern.test(domain)) {
                    threatScore += score;
                    detectedPatterns.push(name);
                }
            }
            
            // Vérifier les imitations UNIQUEMENT si le domaine contient des mots-clés suspects
            const imitationKeywords = [
                'paypal', 'amazon', 'google', 'microsoft', 'apple', 'facebook', 
                'instagram', 'twitter', 'netflix', 'spotify', 'ebay', 'alibaba'
            ];
            
            for (const keyword of imitationKeywords) {
                if (domain.includes(keyword) && !domain.endsWith(keyword + '.com')) {
                    // Le domaine contient le mot-clé mais n'est pas le vrai domaine
                    const realDomain = keyword + '.com';
                    if (domain !== realDomain && !domain.endsWith('.' + realDomain)) {
                        threatScore += 40;
                        detectedPatterns.push(`Possible ${keyword} imitation`);
                    }
                }
            }
            
            // Vérifier les homographes
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname.toLowerCase();
                
                const homographs = {
                    '0': 'o',
                    '1': 'l', 
                    'vv': 'w',
                    'rn': 'm'
                };
                
                for (const [fake, real] of Object.entries(homographs)) {
                    if (domain.includes(fake)) {
                        // Vérifier si c'est une tentative d'imitation
                        for (const keyword of imitationKeywords) {
                            if (domain.includes(keyword.replace(real, fake))) {
                                threatScore += 35;
                                detectedPatterns.push(`Homograph detected: ${fake} instead of ${real}`);
                                break;
                            }
                        }
                    }
                }
                
                // Vérifier les domaines d'hébergement gratuit suspects
                const suspiciousHostingDomains = [
                    'vercel.app', 'netlify.app', 'herokuapp.com', 'github.io', 
                    'gitlab.io', 'surge.sh', 'glitch.me', '000webhostapp.com',
                    'godaddysites.com', 'duckdns.org', 'no-ip.org', 'hopto.org',
                    'ngrok.io', 'serveo.net', 'localtunnel.me'
                ];
                
                let isSuspiciousHosting = false;
                let hostingService = '';
                for (const hostingDomain of suspiciousHostingDomains) {
                    if (domain.endsWith(hostingDomain)) {
                        isSuspiciousHosting = true;
                        hostingService = hostingDomain;
                        threatScore += 15;
                        detectedPatterns.push(`Free hosting service: ${hostingDomain}`);
                        break;
                    }
                }
                
                // Pour les domaines d'hébergement gratuit, être plus strict
                if (isSuspiciousHosting) {
                    // Patterns spécifiques aux sites de phishing sur hébergement gratuit
                    if (/meta|paypal|amazon|microsoft|google|facebook|instagram|netflix|ebay|apple|bank/i.test(domain)) {
                        threatScore += 30;
                        detectedPatterns.push("Brand name in free hosting subdomain");
                    }
                    
                    // Sous-domaines aléatoires suspects (sauf pour GitHub Pages qui utilise username.github.io)
                    if (hostingService !== 'github.io' && /^[a-z0-9]{8,}[-\.]/.test(domain)) {
                        threatScore += 20;
                        detectedPatterns.push("Random subdomain on free hosting");
                    }
                    
                    // Chemins suspects
                    if (/\/(login|verify|secure|account|update|confirm|validation|authenticate)/i.test(url)) {
                        threatScore += 15;
                        detectedPatterns.push("Suspicious path on free hosting");
                    }
                }
                
                // Longueur excessive du domaine
                if (domain.length > 40) {
                    threatScore += 10;
                    detectedPatterns.push("Very long domain name");
                }
                
                // Trop de sous-domaines
                const subdomains = domain.split('.');
                if (subdomains.length > 5) {
                    threatScore += 15;
                    detectedPatterns.push("Too many subdomains");
                }
            } catch (e) {
                threatScore += 20;
                detectedPatterns.push("Malformed URL");
            }
        }
        
        const result = {
            isPhishing: threatScore >= 30, // Seuil réduit pour détecter plus de menaces
            threatScore: threatScore,
            detectedPatterns: detectedPatterns,
            threatType: threatScore >= 70 ? "HIGH_RISK_PHISHING" : 
                       threatScore >= 30 ? "SUSPICIOUS_URL" : "SAFE",
            source: 'Local Detection'
        };
        
        if (result.isPhishing) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                title: 'Suspicious URL Detected',
                message: `Risk score: ${threatScore}%`,
                priority: 2
            });
        }
        
        console.log('Local detection result:', result);
        return result;
        
    } catch (error) {
        console.error("Local detection error:", error);
        return { 
            isPhishing: null, 
            error: true,
            message: error.message,
            source: 'Local Detection'
        };
    }
}

// Fonctions API (Google, PhishTank)
async function getStoredApiKey(service) {
    return new Promise((resolve) => {
        chrome.storage.local.get([`apiKey_${service}`], (result) => {
            resolve(result[`apiKey_${service}`] || null);
        });
    });
}

async function checkWithGoogleAPI(url, apiKey) {
    // Implémentation de l'API Google Safe Browsing
    try {
        const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client: {
                    clientId: "fishguard-pro",
                    clientVersion: "1.0.0"
                },
                threatInfo: {
                    threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
                    platformTypes: ["ANY_PLATFORM"],
                    threatEntryTypes: ["URL"],
                    threatEntries: [{ url: url }]
                }
            })
        });
        
        const data = await response.json();
        
        if (data.matches && data.matches.length > 0) {
            return {
                isPhishing: true,
                threatType: data.matches[0].threatType,
                source: 'Google Safe Browsing'
            };
        }
        
        return { isPhishing: false, source: 'Google Safe Browsing' };
    } catch (error) {
        console.error('Google API error:', error);
        return { isPhishing: false };
    }
}

async function checkWithPhishTank(url, apiKey) {
    // Implémentation de l'API PhishTank
    try {
        const response = await fetch('https://checkurl.phishtank.com/checkurl/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `format=json&app_key=${apiKey}&url=${encodeURIComponent(url)}`
        });
        
        const data = await response.json();
        
        if (data.results && data.results.valid && data.results.verified) {
            return {
                isPhishing: true,
                threatType: 'CONFIRMED_PHISHING',
                source: 'PhishTank API'
            };
        }
        
        return { isPhishing: false, source: 'PhishTank API' };
    } catch (error) {
        console.error('PhishTank API error:', error);
        return { isPhishing: false };
    }
}

// Gestion de la liste blanche
async function checkWhitelist(url) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['whitelist'], (result) => {
            const whitelist = result.whitelist || [];
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;
                resolve(whitelist.includes(domain));
            } catch (e) {
                resolve(false);
            }
        });
    });
}

async function addToWhitelist(url) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['whitelist'], (result) => {
            const whitelist = result.whitelist || [];
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;
                if (!whitelist.includes(domain)) {
                    whitelist.push(domain);
                    chrome.storage.local.set({ whitelist }, resolve);
                } else {
                    resolve();
                }
            } catch (e) {
                resolve();
            }
        });
    });
}

async function removeFromWhitelist(url) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['whitelist'], (result) => {
            let whitelist = result.whitelist || [];
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;
                whitelist = whitelist.filter(d => d !== domain);
                chrome.storage.local.set({ whitelist }, resolve);
            } catch (e) {
                resolve();
            }
        });
    });
}

async function getWhitelist() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['whitelist'], (result) => {
            resolve(result.whitelist || []);
        });
    });
}

// Gestion de l'historique
async function saveToHistory(url, result) {
    chrome.storage.local.get(['history'], (data) => {
        const history = data.history || [];
        const entry = {
            url: url,
            timestamp: new Date().toISOString(),
            result: result
        };
        
        history.unshift(entry);
        
        if (history.length > 100) {
            history.pop();
        }
        
        chrome.storage.local.set({ history });
    });
}

async function getHistory() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['history'], (result) => {
            resolve(result.history || []);
        });
    });
}

async function clearHistory() {
    return new Promise((resolve) => {
        chrome.storage.local.set({ history: [] }, resolve);
    });
}

// Gestion du badge
function updateBadge() {
    if (threatCount > 0) {
        chrome.action.setBadgeText({ text: threatCount.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

function incrementThreatCount() {
    threatCount++;
    chrome.storage.local.set({ threatCount });
    updateBadge();
}

function resetThreatCount() {
    threatCount = 0;
    chrome.storage.local.set({ threatCount });
    updateBadge();
}

// Nettoyer le cache périodiquement
setInterval(() => {
    const now = Date.now();
    for (const [url, data] of urlCache.entries()) {
        if (now - data.timestamp > CACHE_DURATION) {
            urlCache.delete(url);
        }
    }
    console.log("Cache cleaned, current size:", urlCache.size);
}, CACHE_DURATION);

// Exposer des fonctions utiles pour le débogage
if (typeof globalThis !== 'undefined') {
    globalThis.forceUpdateLists = async () => {
        if (phishingListsManager) {
            await phishingListsManager.updateLists();
            console.log('Lists updated!');
        }
    };
    
    globalThis.checkPhishingUrl = (url) => {
        if (phishingListsManager) {
            return phishingListsManager.checkUrl(url);
        }
        return { error: 'Lists not initialized' };
    };
    
    globalThis.getListsStats = () => {
        if (phishingListsManager) {
            return {
                urls: phishingListsManager.phishingUrls.size,
                domains: phishingListsManager.phishingDomains.size
            };
        }
        return { error: 'Lists not initialized' };
    };
    
    globalThis.searchInLists = (keyword) => {
        if (!phishingListsManager) return { error: 'Lists not initialized' };
        
        const results = {
            urls: [],
            domains: []
        };
        
        // Chercher dans les URLs
        for (const url of phishingListsManager.phishingUrls) {
            if (url.includes(keyword.toLowerCase())) {
                results.urls.push(url);
            }
        }
        
        // Chercher dans les domaines
        for (const domain of phishingListsManager.phishingDomains) {
            if (domain.includes(keyword.toLowerCase())) {
                results.domains.push(domain);
            }
        }
        
        return results;
    };
    
    globalThis.diagnoseUrl = (testUrl) => {
        if (!phishingListsManager) {
            console.log('❌ Lists not initialized');
            return;
        }
        
        console.log('=== DIAGNOSTIC FOR URL ===');
        console.log('Test URL:', testUrl);
        console.log('Database size:', getListsStats());
        
        const normalized = testUrl.toLowerCase().trim();
        console.log('Normalized:', normalized);
        
        // Extraire le domaine
        let domain = '';
        try {
            const urlObj = new URL(normalized.startsWith('http') ? normalized : 'http://' + normalized);
            domain = urlObj.hostname.toLowerCase();
            console.log('Domain:', domain);
            console.log('Path:', urlObj.pathname);
        } catch (e) {
            console.log('Invalid URL format');
        }
        
        // Chercher des correspondances exactes
        console.log('\n--- Checking exact matches ---');
        const variants = [
            normalized,
            'http://' + normalized.replace(/^https?:\/\//, ''),
            'https://' + normalized.replace(/^https?:\/\//, ''),
            normalized.endsWith('/') ? normalized.slice(0, -1) : normalized + '/'
        ];
        
        for (const variant of variants) {
            const exists = phishingListsManager.phishingUrls.has(variant);
            console.log(`${exists ? '✅' : '❌'} ${variant}`);
        }
        
        // Chercher le domaine
        console.log('\n--- Checking domain ---');
        console.log('Domain in list:', phishingListsManager.phishingDomains.has(domain));
        
        // Chercher des URLs similaires
        console.log('\n--- Similar URLs in database ---');
        let count = 0;
        for (const storedUrl of phishingListsManager.phishingUrls) {
            if (domain && storedUrl.includes(domain)) {
                console.log('Found:', storedUrl);
                count++;
                if (count >= 10) {
                    console.log('... (showing first 10 only)');
                    break;
                }
            }
        }
        
        // Tester avec la fonction de vérification
        console.log('\n--- Check result ---');
        const result = phishingListsManager.checkUrl(testUrl);
        console.log(result);
        
        // Vérifier pourquoi ça ne match pas
        if (!result.isPhishing && domain) {
            console.log('\n--- Why no match? ---');
            
            // Chercher des URLs avec le même début
            const urlStart = normalized.substring(0, 30);
            console.log(`URLs starting with "${urlStart}":`);
            count = 0;
            for (const storedUrl of phishingListsManager.phishingUrls) {
                if (storedUrl.startsWith(urlStart)) {
                    console.log('- ' + storedUrl);
                    count++;
                    if (count >= 5) break;
                }
            }
        }
    };
}

// Test automatique au démarrage pour vérifier les URLs problématiques
setTimeout(async () => {
    if (phishingListsManager && phishingListsManager.phishingUrls.size > 0) {
        console.log('=== RUNNING SELF-TEST ===');
        const testUrls = [
            'http://vcvgdtwtuo.duckdns.org/en/',
            'http://overlook-local-manage-idd3520842196.vercel.app/hhkruu.html',
            'http://meveipreupreiloi-1079-64892810-projects.vercel.app/meta.html/',
            'https://d49e8b53c2f1.godaddysites.com/'
        ];
        
        for (const testUrl of testUrls) {
            const result = await checkPhishing(testUrl);
            console.log(`Test ${testUrl}: ${result.isPhishing ? '✅ DETECTED' : '❌ MISSED'} - ${result.source || 'Not found'}`);
        }
        console.log('=== SELF-TEST COMPLETE ===');
    }
}, 10000); // Attendre 10 secondes après le démarrage