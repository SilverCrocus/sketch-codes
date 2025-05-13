import React from 'react';

const HomePage: React.FC = () => {
  const handleCreateGame = () => {
    // Later, this will navigate to a new game room or trigger game creation logic
    console.log('Create Game button clicked');
    alert('Create Game functionality will be implemented soon!');
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Welcome to Sketch-Codes!</h1>
      <p>Get ready to draw and guess with a friend.</p>
      <button 
        onClick={handleCreateGame}
        style={{ padding: '10px 20px', fontSize: '1.2em', cursor: 'pointer' }}
      >
        Create New Game
      </button>
      {/* We can add a "Join Game" section here later */}
    </div>
  );
};

export default HomePage;
