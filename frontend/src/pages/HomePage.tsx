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
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to create game. Server returned an error.' }));
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
    <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 min-h-screen flex flex-col items-center justify-center p-4 text-white">
      <h1 className="text-5xl font-bold mb-4 text-center shadow-sm">Welcome to Sketch-Codes!</h1>
      <p className="text-xl mb-8 text-center">Get ready to draw and guess with a friend.</p>
      <button
        onClick={handleCreateGame}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 text-lg rounded-md shadow-md cursor-pointer mb-5 transition-colors duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isCreatingGame}
      >
        {isCreatingGame ? 'Creating...' : 'Create New Game'}
      </button>

      {/* --- Join Game Section --- */}
      <div className="mt-8 w-full max-w-md flex flex-col items-center bg-white/20 dark:bg-gray-800/30 backdrop-blur-lg p-8 rounded-xl shadow-2xl">
        <h2 className="text-3xl font-semibold mb-6 text-center text-white dark:text-gray-100">
          Or Join an Existing Game
        </h2>
        <div className="flex w-full">
          <input
            type="text"
            value={joinGameId}
            onChange={(e) => setJoinGameId(e.target.value)}
            placeholder="Enter Game ID"
            className="flex-grow p-3 border border-gray-300 dark:border-gray-600 rounded-l-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-base text-gray-900 dark:text-white bg-white dark:bg-gray-700 min-w-[150px]"
          />
          <button
            onClick={handleJoinGame}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 text-base rounded-r-md shadow-md cursor-pointer transition-colors duration-150 ease-in-out whitespace-nowrap"
          >
            Join Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
