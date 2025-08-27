import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import { Home } from './pages/Home'
import { Toaster } from 'sonner'


function App() {
  const initialize = useAppStore(state => state.initialize)

  useEffect(() => {
    initialize()
  }, []) // Pas de dépendance pour éviter les boucles infinies

  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </Router>
  )
}

export default App
