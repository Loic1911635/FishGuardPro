// languages.js - Gestion du multilingue
const translations = {
    en: {
        // Popup
        appName: "FishGuard Pro",
        scanCurrentPage: "Scan Current Page",
        scanPastedLink: "Scan Pasted Link",
        enterUrl: "Enter a URL...",
        scanning: "Scanning...",
        
        // Results
        siteSafe: "This site appears to be safe",
        siteDangerous: "DANGER: Malicious site detected!",
        siteWhitelisted: "Trusted site",
        scanError: "Unable to verify this link",
        beCautious: "Please be cautious while browsing",
        doNotEnterInfo: "Do not enter personal information!",
        
        // Details
        domain: "Domain",
        threatType: "Threat type",
        riskScore: "Risk score",
        source: "Source",
        verifiedAt: "Verified at",
        addToWhitelist: "Add to whitelist",
        added: "Added!",
        
        // Navigation
        history: "History",
        
        // History page
        historyTitle: "History and Configuration",
        back: "Back",
        historyTab: "History",
        whitelistTab: "Whitelist",
        statsTab: "Statistics",
        verificationHistory: "Verification History",
        clearAll: "Clear All",
        trustedSites: "Trusted Sites",
        whitelistDesc: "Domains in this list will not be checked and will always be considered safe.",
        domainPlaceholder: "example.com",
        add: "Add",
        remove: "Remove",
        statistics: "Statistics",
        totalScans: "Total Scans",
        dangerousSites: "Dangerous Sites",
        safeSites: "Safe Sites",
        resetCounter: "Reset threat counter",
        noHistory: "No verifications in history",
        noHistoryDesc: "Your scan history will appear here",
        noWhitelist: "No domains in whitelist",
        noWhitelistDesc: "Add trusted domains to avoid unnecessary checks",
        safe: "Safe",
        dangerous: "Dangerous",
        whitelisted: "Whitelisted",
        error: "Error",
        type: "Type",
        score: "Score",
        threatDistribution: "Threat Distribution",
        noData: "No data to display",
        confirmClearHistory: "Are you sure you want to clear all history?",
        enterDomain: "Please enter a domain",
        counterReset: "Threat counter reset!",
        confirmRemove: "Remove this domain from whitelist?",
        
        // Threat types
        MALWARE: "Malware",
        SOCIAL_ENGINEERING: "Phishing / Social Engineering",
        UNWANTED_SOFTWARE: "Unwanted Software",
        POTENTIALLY_HARMFUL_APPLICATION: "Potentially Harmful Application",
        CONFIRMED_PHISHING: "Confirmed Phishing",
        HIGH_RISK_PHISHING: "High Risk Phishing",
        SUSPICIOUS_URL: "Suspicious URL"
    },
    
    fr: {
        // Popup
        appName: "FishGuard Pro",
        scanCurrentPage: "Scanner la page actuelle",
        scanPastedLink: "Scanner le lien collé",
        enterUrl: "Entrez une URL...",
        scanning: "Analyse en cours...",
        
        // Results
        siteSafe: "Ce site semble sûr",
        siteDangerous: "DANGER : Site malveillant détecté !",
        siteWhitelisted: "Site de confiance",
        scanError: "Impossible de vérifier ce lien",
        beCautious: "Soyez prudent lors de la navigation",
        doNotEnterInfo: "Ne pas entrer d'informations personnelles !",
        
        // Details
        domain: "Domaine",
        threatType: "Type de menace",
        riskScore: "Score de risque",
        source: "Source",
        verifiedAt: "Vérifié à",
        addToWhitelist: "Ajouter à la liste blanche",
        added: "Ajouté !",
        
        // Navigation
        history: "Historique",
        
        // History page
        historyTitle: "Historique et Configuration",
        back: "Retour",
        historyTab: "Historique",
        whitelistTab: "Liste blanche",
        statsTab: "Statistiques",
        verificationHistory: "Historique des vérifications",
        clearAll: "Tout effacer",
        trustedSites: "Sites de confiance",
        whitelistDesc: "Les domaines dans cette liste ne seront pas vérifiés et seront toujours considérés comme sûrs.",
        domainPlaceholder: "exemple.com",
        add: "Ajouter",
        remove: "Retirer",
        statistics: "Statistiques",
        totalScans: "Vérifications totales",
        dangerousSites: "Sites dangereux",
        safeSites: "Sites sûrs",
        resetCounter: "Réinitialiser le compteur de menaces",
        noHistory: "Aucune vérification dans l'historique",
        noHistoryDesc: "Votre historique de scans apparaîtra ici",
        noWhitelist: "Aucun domaine dans la liste blanche",
        noWhitelistDesc: "Ajoutez des domaines de confiance pour éviter les vérifications inutiles",
        safe: "Sûr",
        dangerous: "Dangereux",
        whitelisted: "Liste blanche",
        error: "Erreur",
        type: "Type",
        score: "Score",
        threatDistribution: "Répartition des menaces",
        noData: "Aucune donnée à afficher",
        confirmClearHistory: "Êtes-vous sûr de vouloir effacer tout l'historique ?",
        enterDomain: "Veuillez entrer un domaine",
        counterReset: "Compteur de menaces réinitialisé !",
        confirmRemove: "Retirer ce domaine de la liste blanche ?",
        
        // Threat types
        MALWARE: "Logiciel malveillant",
        SOCIAL_ENGINEERING: "Phishing / Ingénierie sociale",
        UNWANTED_SOFTWARE: "Logiciel indésirable",
        POTENTIALLY_HARMFUL_APPLICATION: "Application potentiellement dangereuse",
        CONFIRMED_PHISHING: "Phishing confirmé",
        HIGH_RISK_PHISHING: "Phishing à haut risque",
        SUSPICIOUS_URL: "URL suspecte"
    }
};

// Obtenir la langue actuelle
async function getCurrentLanguage() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['language'], (result) => {
            resolve(result.language || 'en'); // Par défaut : anglais
        });
    });
}

// Définir la langue
async function setLanguage(lang) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ language: lang }, resolve);
    });
}

// Obtenir une traduction
async function t(key) {
    const lang = await getCurrentLanguage();
    return translations[lang]?.[key] || translations['en'][key] || key;
}

// Obtenir toutes les traductions pour la langue actuelle
async function getTranslations() {
    const lang = await getCurrentLanguage();
    return translations[lang] || translations['en'];
}

// Exporter pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { translations, getCurrentLanguage, setLanguage, t, getTranslations };
}