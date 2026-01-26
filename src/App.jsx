import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [active, setActive] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(['extensionActive'], (result) => {
      setActive(result.extensionActive !== false);
    });
  }, []);


  const toggleActive = async () => {
    const newActive = !active;
    setActive(newActive);
  

    chrome.storage.local.set({ extensionActive: newActive });

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { 
          action: 'toggleExtension', 
          active: newActive 
        });
      } catch (error) {
        console.log('Could not send message to content script:', error);
      }
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h2>TikTok Feed Blocker</h2>
      </div>
      
      <div className="popup-content">
        <p className="status-text">
          {active ? "Extension is active" : "Extension is inactive"}
        </p>
        
        <div className="switch-container">
          <label className="switch">
            <input 
              type="checkbox" 
              checked={active} 
              onChange={toggleActive}
            />
            <span className="slider"></span>
          </label>
        </div>
        
        <p className="action-text">
          {active ? "Click to deactivate" : "Click to activate"}
        </p>
      </div>
    </div>
  )
}

export default App