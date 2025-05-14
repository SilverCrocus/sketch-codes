import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [joinGameId, setJoinGameId] = useState<string>('');
  const [isCreatingGame, setIsCreatingGame] = useState(false);

  const handleCreateGame = async () => {
    setIsCreatingGame(true);
    try {
      const response = await fetch('/api/create_game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        // Try to get error message from backend if available
        const errorData = await response.json().catch(() => ({ message: 'Failed to create game. Server returned an error.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.game_id) {
        navigate(`/game/${data.game_id}`);
      } else {
        throw new Error('Failed to create game: No game_id received from server.');
      }
    } catch (error) {
      console.error('Error creating game:', error);
      alert(`Could not create game: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreatingGame(false);
    }
  };

  const handleJoinGame = () => {
    if (joinGameId.trim() !== '') {
      navigate(`/game/${joinGameId.trim()}`);
    } else {
      alert('Please enter a Game ID to join.');
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Welcome to Sketch-Codes!</h1>
      <p>Get ready to draw and guess with a friend.</p>
      <button 
        onClick={handleCreateGame}
        style={{ padding: '10px 20px', fontSize: '1.2em', cursor: 'pointer', marginBottom: '20px' }}
        disabled={isCreatingGame}
      >
        {isCreatingGame ? 'Creating...' : 'Create New Game'}
      </button>

      {/* --- Join Game Section --- */}
      <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '30px' }}>
        <h2>Or Join an Existing Game</h2>
        <input 
          type="text" 
          value={joinGameId} 
          onChange={(e) => setJoinGameId(e.target.value)} 
          placeholder="Enter Game ID" 
          style={{ padding: '10px', fontSize: '1em', marginRight: '10px', minWidth: '200px' }}
        />
        <button 
          onClick={handleJoinGame} 
          style={{ padding: '10px 20px', fontSize: '1em', cursor: 'pointer' }}
        >
          Join Game
        </button>
      </div>
    </div>
  );
};

export default HomePage;
