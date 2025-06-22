import { useState } from 'react'
import './App.css'

function App() {
  const [active, setActive] = useState(true);

  const toggleActive = () => {
    setActive(!active);
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h2>TikTok Feed Blocker check</h2>
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