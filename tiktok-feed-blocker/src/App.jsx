import { useState } from 'react'
import './App.css'

function App() {
  const [active, setActive] = useState(true);
  return (
    <div>
      <p>{active ? "Deactivate extension" : "Activate extension"}</p>
      <button>
        Supposed to be switch
      </button>
    </div>
  )
}

export default App
