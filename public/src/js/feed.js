var shareImageButton = document.querySelector('#share-image-button');
var createPostArea = document.querySelector('#create-post');
var closeCreatePostModalButton = document.querySelector('#close-create-post-modal-btn');
var sharedMomentsArea = document.querySelector('#shared-moments');
var url = 'https://uctcigxwrwqiajnazggs.supabase.co/rest/v1/post?select=*';
var apikey = "sb_publishable_VZIBKKbLsnS4RIBNf5yv4Q_xPUFpndL";
var apiKey = apikey;
var form = document.querySelector('form');
var titleInput = document.querySelector('#title');
var locationInput = document.querySelector('#location');

function openCreatePostModal() {
    // createPostArea.style.display = 'block';
    createPostArea.style.transform = 'translateY(0)';
    if (deferredPrompt) {
        deferredPrompt.prompt();

        deferredPrompt.userChoice.then(function (choiceResult) {
            console.log(choiceResult.outcome);

            if (choiceResult.outcome === 'dismissed') {
                console.log('User cancelled installation');
            } else {
                console.log('User added to home screen');
            }
        });

        deferredPrompt = null;
    }
}

function closeCreatePostModal() {
    // createPostArea.style.display = 'none';
    createPostArea.style.transform = 'translateY(100vh)';
}

shareImageButton.addEventListener('click', openCreatePostModal);
closeCreatePostModalButton.addEventListener('click', closeCreatePostModal);

function clearCards() {
    while (sharedMomentsArea.hasChildNodes()) {
        sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
    }
}

function createCard(data) {
    var cardWrapper = document.createElement('div');
    cardWrapper.className = 'shared-moment-card mdl-card mdl-shadow--2dp';
    var cardTitle = document.createElement('div');
    cardTitle.className = 'mdl-card__title';
    cardTitle.style.backgroundImage = 'url(' + data.image + ')';
    cardTitle.style.backgroundSize = 'cover';
    cardWrapper.appendChild(cardTitle);
    var cardTitleTextElement = document.createElement('h2');
    cardTitleTextElement.style.color = 'white';
    cardTitleTextElement.className = 'mdl-card__title-text';
    cardTitleTextElement.textContent = data.title;
    cardTitle.appendChild(cardTitleTextElement);
    var cardSupportingText = document.createElement('div');
    cardSupportingText.className = 'mdl-card__supporting-text';
    cardSupportingText.textContent = data.location;
    cardSupportingText.style.textAlign = 'center';
    cardWrapper.appendChild(cardSupportingText);
    componentHandler.upgradeElement(cardWrapper);
    sharedMomentsArea.appendChild(cardWrapper);
}

function updateUI(data) {
    clearCards();
    for (var i = 0; i < data.length; i++) {
        createCard(data[i]);
    }
}

// Estrategia Cache then Network
var networkDataReceived = false;

function fetchPosts() {
    return fetch(url, {
        headers: {
            'apikey': apikey,
            'Authorization': 'Bearer ' + apikey
        }
    })
        .then(function (res) {
            return res.json();
        })
        .then(function (data) {
            networkDataReceived = true;
            console.log('From web', data);
            var dataArray = [];
            for (var key in data) {
                dataArray.push(data[key]);
            }
            updateUI(dataArray);
            if ('indexedDB' in window) {
                clearAllData('posts').then(function () {
                    for (var i = 0; i < dataArray.length; i++) {
                        writeData('posts', dataArray[i]);
                    }
                });
            }
        })
        .catch(function (err) {
            console.log('Modo sin conexión (usando datos locales):', err);
        });
}

fetchPosts();
setTimeout(syncPendingPosts, 1000);

if ('indexedDB' in window) {
    readAllData('posts')
        .then(function (data) {
            if (!networkDataReceived) {
                console.log('From cache', data);
                updateUI(data);
            }
        });
}

function postSingleItem(dt) {
    var postUrl = 'https://uctcigxwrwqiajnazggs.supabase.co/rest/v1/post';
    var headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': apikey,
        'Authorization': 'Bearer ' + apikey
    };
    var defaultImage = dt.image || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80';

    return fetch(postUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            id: dt.id,
            title: dt.title,
            location: dt.location,
            image: defaultImage
        })
    });
}

function sendData(post) {
    return postSingleItem(post)
        .then(function (res) {
            console.log('Sent data', res);
            fetchPosts();
        });
}

var isSyncingPending = false;
function syncPendingPosts() {
    if (!('indexedDB' in window) || isSyncingPending) return;
    isSyncingPending = true;
    readAllData('sync-posts')
        .then(function (data) {
            if (!data || data.length === 0) {
                isSyncingPending = false;
                return;
            }
            var promises = data.map(function (dt) {
                return postSingleItem(dt)
                    .then(function (res) {
                        if (res && (res.ok || res.status === 409)) {
                            console.log('Post pendiente sincronizado con Supabase:', dt.title);
                            return deleteItemFromData('sync-posts', dt.id);
                        }
                    });
            });
            return Promise.all(promises).then(function () {
                isSyncingPending = false;
                fetchPosts();
            });
        })
        .catch(function () {
            isSyncingPending = false;
        });
}

// Monitoreo continuo por si el adaptador virtual (Docker/WSL) impide el evento 'online' al reconectar Wi-Fi
setInterval(syncPendingPosts, 3000);

window.addEventListener('online', function () {
    console.log('Conexión Wi-Fi restaurada, sincronizando posts...');
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then(function (sw) {
                return sw.sync.register('sync-new-posts');
            })
            .catch(function () {});
    }
    // Reintentos escalonados para cuando el Wi-Fi tarda unos segundos en tener salida DNS
    setTimeout(syncPendingPosts, 1500);
    setTimeout(syncPendingPosts, 4000);
    setTimeout(syncPendingPosts, 7000);
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.action === 'sync-completed') {
            console.log('Sync completado por el Service Worker, actualizando feed...');
            fetchPosts();
        }
    });
}

form.addEventListener('submit', function (event) {
    event.preventDefault();

    if (titleInput.value.trim() === '' || locationInput.value.trim() === '') {
        alert('Please enter valid data!');
        return;
    }

    closeCreatePostModal();

    var post = {
        id: new Date().toISOString(),
        title: titleInput.value,
        location: locationInput.value,
        image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80'
    };

    titleInput.value = '';
    locationInput.value = '';

    if ('indexedDB' in window) {
        writeData('sync-posts', post)
            .then(function () {
                if ('serviceWorker' in navigator && 'SyncManager' in window) {
                    return navigator.serviceWorker.ready.then(function (sw) {
                        return sw.sync.register('sync-new-posts');
                    });
                } else if (navigator.onLine) {
                    return syncPendingPosts();
                }
            })
            .then(function () {
                var snackbarContainer = document.querySelector('#confirmation-toast');
                var data = { message: 'Your Post was saved for syncing!' };
                if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
                    snackbarContainer.MaterialSnackbar.showSnackbar(data);
                }
            })
            .catch(function (err) {
                console.log(err);
            });
    } else {
        sendData(post);
    }
});