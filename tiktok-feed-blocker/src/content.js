const SELECTORS = {
 mainContent: '#main-content-explore_page',
 progressIndicator: '.progress-js-inner',
 columnListContainer: '#column-list-container',
 exploreLayout: '[class*="DivShareLayoutBase-StyledShareLayoutV2-ExploreLayout"]',
 progressElements: '[class*="progress"]'
};

function muteMediaInBlockedContainers() {
 const blockedContainers = [
   document.querySelector(SELECTORS.mainContent),
   document.querySelector(SELECTORS.columnListContainer),
   ...document.querySelectorAll(SELECTORS.exploreLayout)
 ].filter(container => container !== null);

 blockedContainers.forEach(container => {
   const videos = container.querySelectorAll('video');
   videos.forEach(video => {
     if (!video.muted) {
       video.muted = true;
       video.volume = 0;
     }
   });

   const audios = container.querySelectorAll('audio');
   audios.forEach(audio => {
     if (!audio.muted) {
       audio.muted = true;
       audio.volume = 0;
     }
   });
 });
}

function blockFeedElements() {
 muteMediaInBlockedContainers();

 const mainContent = document.querySelector(SELECTORS.mainContent);
 if (mainContent && mainContent.style.display !== 'none') {
   mainContent.style.display = 'none';
   return;
 }

 const columnListContainer = document.querySelector(SELECTORS.columnListContainer);
 if (columnListContainer && columnListContainer.style.display !== 'none') {
   columnListContainer.style.display = 'none';
 }

 const progressIndicator = document.querySelector(SELECTORS.progressIndicator);
 if (progressIndicator && progressIndicator.style.display !== 'none') {
   progressIndicator.style.display = 'none';
 }

 const progressElements = document.querySelectorAll(SELECTORS.progressElements);
 progressElements.forEach(element => {
   if (element && element.style.display !== 'none') {
     element.style.display = 'none';
   }
 });

 const exploreLayouts = document.querySelectorAll(SELECTORS.exploreLayout);
 exploreLayouts.forEach(layout => {
   if (layout && layout.style.display !== 'none') {
     layout.style.display = 'none';
   }
 });
}

function setupObserver() {
 const observer = new MutationObserver((mutations) => {
   mutations.forEach((mutation) => {
     if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
       mutation.addedNodes.forEach((node) => {
         if (node.nodeType === Node.ELEMENT_NODE) {
           setTimeout(() => {
             blockFeedElements();
           }, 100);
         }
       });
     }
   });
 });

 observer.observe(document.body, {
   childList: true,
   subtree: true
 });

 return observer;
}

function init() {
 blockFeedElements();
 setupObserver();
 setInterval(blockFeedElements, 1000);
}

if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', init);
} else {
 init();
}