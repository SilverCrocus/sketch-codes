import React from 'react';
import { useParams } from 'react-router-dom'; // To access URL parameters like gameId

const GamePage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>(); // Example: Accessing gameId from URL

  // For now, WordGrid is still in App.tsx or directly rendered.
  // We will move WordGrid and other game elements here later.

  return (
    <div>
      <h2>Game Room</h2>
      {gameId && <p>You are in Game ID: {gameId}</p>}
      <p>The game board and drawing canvas will appear here.</p>
      {/* Placeholder for WordGrid and DrawingCanvas */}
    </div>
  );
};

export default GamePage;
