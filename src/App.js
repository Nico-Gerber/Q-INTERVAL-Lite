import React from 'react';
import { Routes, Route } from 'react-router-dom';           
import './App.css';

import Navigation from './components/Navigation';
import Footer from './components/Footer';

import Home from './pages/home';
import OurTeam from './pages/ourteam';

function App() {
  return (
    <div className="app-root">
      <Navigation />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/OurTeam" element={<OurTeam />} />
      </Routes>

      <Footer />
    </div>
  );
}

export default App;