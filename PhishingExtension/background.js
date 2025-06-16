chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scanURL") {
        const url = request.url;

        // 🚨 Simulation locale
        if (url.includes("testdanger")) {
            console.log("Simulation phishing détecté");
            sendResponse({ isPhishing: true });
            return true;
        }

        Promise.all([
            checkPhishing(url)
        ])
        .then(([isGooglePhishing]) => {
            sendResponse({ isPhishing: isGooglePhishing });
        });

        return true; // Indique une réponse async
    }
});


// Fonction pour vérifier si une URL est malveillante
async function checkPhishing(url) {
    const apiKey = "AIzaSyDk51kwtiwDPjPsLwpQz_XqtgFVSsBjwMk";
    const apiUrl = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;

    const requestBody = {
        client: {
            clientId: "PhishingExtension",
            clientVersion: "1.0"
        },
        threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }]
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        console.log("🟡 Google Safe Browsing response :", data); // 👈 ICI
        return data.matches ? true : false;

    } catch (error) {
        console.error("❌ Erreur API Google:", error);
        return false;
    }
}

// "AIzaSyDk51kwtiwDPjPsLwpQz_XqtgFVSsBjwMk"