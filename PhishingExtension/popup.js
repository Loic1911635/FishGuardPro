document.addEventListener("DOMContentLoaded", function () {
    const scanPageButton = document.getElementById("scanPageButton");
    const scanLinkButton = document.getElementById("scanLinkButton");
    const resultText = document.getElementById("result");

    // Bouton 1 : Scanner la page actuelle
    scanPageButton.addEventListener("click", function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const currentUrl = tabs[0].url;

            chrome.runtime.sendMessage({ action: "scanURL", url: currentUrl }, function (response) {
                afficherResultat(response);
            });
        });
    });

    // Bouton 2 : Scanner le lien entré manuellement
    scanLinkButton.addEventListener("click", function () {
        let url = document.getElementById("urlInput").value.trim();

        if (!url) {
            alert("Veuillez entrer une URL.");
            return;
        }

        // Ajouter https:// si absent
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }

        chrome.runtime.sendMessage({ action: "scanURL", url: url }, function (response) {
            afficherResultat(response);
        });
    });

    function afficherResultat(response) {
        if (response && response.isPhishing) {
            resultText.innerHTML = "🚨 Ce site est potentiellement dangereux !";
            resultText.style.color = "red";
        } else {
            resultText.innerHTML = "✅ Ce site semble sûr.";
            resultText.style.color = "green";
        }
    }
});
