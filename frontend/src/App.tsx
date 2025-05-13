import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import './App.css';

function App() {
  return (
    <div className="App"> 
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/game/:gameId" element={<GamePage />} />
        {/* We can add a "catch-all" route for 404s later if needed */}
      </Routes>
    </div>
  );
}

export default App;
