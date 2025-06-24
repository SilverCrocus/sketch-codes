import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [joinGameId, setJoinGameId] = useState<string>('');
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [error, setError] = useState<string>('');

  const handleCreateGame = async () => {
    setIsCreatingGame(true);
    setError('');
    try {
      const response = await fetch('/api/create_game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          message: 'Failed to create game. Server returned an error.' 
        }));
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
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingGame(false);
    }
  };

  const handleJoinGame = () => {
    setError('');
    if (joinGameId.trim() !== '') {
      navigate(`/game/${joinGameId.trim()}`);
    } else {
      setError('Please enter a Game ID to join.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJoinGame();
    }
  };

  const CreateIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );

  const JoinIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const GamepadIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
    </svg>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-4 -right-4 w-72 h-72 bg-blue-100 rounded-full mix-blend-multiply blur-xl opacity-70 animate-pulse-subtle"></div>
        <div className="absolute -bottom-8 -left-4 w-72 h-72 bg-green-100 rounded-full mix-blend-multiply blur-xl opacity-70 animate-pulse-subtle" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-yellow-100 rounded-full mix-blend-multiply blur-xl opacity-70 animate-pulse-subtle" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Main Card */}
        <Card className="animate-fade-in" padding="lg">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-green-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-2 bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
              Sketch Codes
            </h1>
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
              Draw, guess, and have fun with friends
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg animate-slide-in">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Create Game Section */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Start a New Game
            </h2>
            <Button 
              onClick={handleCreateGame}
              loading={isCreatingGame}
              leftIcon={CreateIcon}
              className="w-full"
            >
              Create New Game
            </Button>
          </div>

          {/* Divider */}
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500 font-medium">or</span>
            </div>
          </div>

          {/* Join Game Section */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Join Existing Game
            </h2>
            <div className="space-y-4">
              <Input
                label="Game ID"
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your game ID"
                leftIcon={GamepadIcon}
                error={error && !isCreatingGame ? error : undefined}
              />
              <Button 
                onClick={handleJoinGame}
                variant="secondary"
                leftIcon={JoinIcon}
                disabled={!joinGameId.trim()}
                className="w-full"
              >
                Join Game
              </Button>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <p className="text-sm text-gray-500">
            Connect with friends and unleash your creativity
          </p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
