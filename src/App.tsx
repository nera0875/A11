import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import { Home } from './pages/Home'
import { Toaster } from 'sonner'

function App() {
  const { initialize } = useAppStore()

  useEffect(() => {
    initialize()
  }, [])

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  )
}

export default App
