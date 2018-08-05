/*
Common ServiceWorker register that all pages perform
*/

document.addEventListener('DOMContentLoaded', registerServiceWorker);

function registerServiceWorker() {
    if (!navigator.serviceWorker) return;

    const currentFolder = location.pathname.substring(0, location.pathname.lastIndexOf("/"));
    const swFile = currentFolder + "/sw.js";

    const controller = this;
    navigator.serviceWorker.register(swFile).then(function(reg) {
        console.log("ServiceWorker Registered");
        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", function(event) {
            console.log("Controller Change!");
            if (!reloading) window.location.reload();
            reloading = true;
        });

    });
}
