// content.js - TikTok Feed Blocker

// Configuration - targeting the main explore page content + progress indicator
const SELECTORS = {
  // Main content container for the explore page
  mainContent: '#main-content-explore_page',
  // Progress indicator that shows loading
  progressIndicator: '.progress-js-inner',
  // Alternative selectors in case the structure changes
  exploreLayout: '[class*="DivShareLayoutBase-StyledShareLayoutV2-ExploreLayout"]',
  // Broader selector for any main content containers
  mainContentGeneric: '[id*="main-content"]',
  // Any progress-related elements
  progressElements: '[class*="progress"]'
};

// Main blocking function
function blockFeedElements() {
  // Primary target: the main explore page content
  const mainContent = document.querySelector(SELECTORS.mainContent);
  if (mainContent && mainContent.style.display !== 'none') {
    mainContent.style.display = 'none';
    console.log('TikTok explore page blocked');
    return; // Exit early if we found and blocked the main container
  }

  // Block progress indicator
  const progressIndicator = document.querySelector(SELECTORS.progressIndicator);
  if (progressIndicator && progressIndicator.style.display !== 'none') {
    progressIndicator.style.display = 'none';
    console.log('TikTok progress indicator blocked');
  }

  // Block any progress-related elements (broader catch)
  const progressElements = document.querySelectorAll(SELECTORS.progressElements);
  progressElements.forEach(element => {
    if (element && element.style.display !== 'none') {
      element.style.display = 'none';
    }
  });

  // Fallback: target by class pattern
  const exploreLayouts = document.querySelectorAll(SELECTORS.exploreLayout);
  exploreLayouts.forEach(layout => {
    if (layout && layout.style.display !== 'none') {
      layout.style.display = 'none';
      console.log('TikTok explore layout blocked');
    }
  });

  // Additional fallback: any main content containers
  const genericContainers = document.querySelectorAll(SELECTORS.mainContentGeneric);
  genericContainers.forEach(container => {
    if (container && container.style.display !== 'none') {
      container.style.display = 'none';
      console.log('TikTok main content blocked');
    }
  });
}

// Observer to handle dynamically loaded content
function setupObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if new nodes contain feed elements
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Block newly added feed elements
            setTimeout(blockFeedElements, 100); // Small delay to ensure elements are rendered
          }
        });
      }
    });
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
}

// Initialize the blocker
function init() {
  console.log('TikTok Feed Blocker initialized V4');
  
  // Block existing elements immediately
  blockFeedElements();
  
  // Set up observer for dynamic content
  setupObserver();
  
  // Re-run blocking periodically as backup
  setInterval(blockFeedElements, 1000);
}

// Wait for DOM to be ready and start blocking
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}