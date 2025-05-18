import React from 'react';

interface WordGridProps {
  words: string[];
  keyCard: string[];
  revealedCards: string[];
  onWordClick: (index: number) => void;
  isGuessingActive: boolean;
  isCurrentGuesser: boolean;
  myRole: 'drawer' | 'guesser' | 'spectator' | 'connecting'; // Added for role-specific rendering
}

// Add CSS animation for the spinner
const SpinnerAnimation = () => (
  <style>
    {`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}
  </style>
);

const WordGrid: React.FC<WordGridProps> = ({ 
  words, 
  keyCard, 
  revealedCards, 
  onWordClick, 
  isGuessingActive,
  isCurrentGuesser,
  myRole // Added prop
}) => {
  // Helper function to determine the styling for each card
  const getCardStyle = (index: number): React.CSSProperties => {
    const baseStyle = { ...styles.gridTile }; // Default style from styles object
    let cardColor = baseStyle.backgroundColor;
    let textColor = baseStyle.color || 'black';
    let cursorStyle = baseStyle.cursor;
    let borderStyle = baseStyle.border;

    // Determine base card color based on role and keyCard/revealedCards
    if (myRole === 'drawer' || myRole === 'guesser') {
      // Drawers and Guessers (in Duet style) see their respective keyCard colors for unrevealed cards
      const trueColor = keyCard[index]; // This should be the player-specific keyCard
      if (revealedCards[index]) {
        // If card is revealed, show its revealed color to everyone
        if (revealedCards[index] === 'green') { cardColor = '#7cb342'; textColor = 'white'; }
        else if (revealedCards[index] === 'assassin') { cardColor = '#d32f2f'; textColor = 'white'; }
        else if (revealedCards[index] === 'neutral') { cardColor = '#bdbdbd'; textColor = 'black'; }
        else { cardColor = '#FFFACD'; textColor = 'black'; } // Revealed team/other color
      } else {
        // Card not revealed, show player's keyCard color
        if (trueColor === 'green') { cardColor = '#7cb342'; textColor = 'white'; }
        else if (trueColor === 'assassin') { cardColor = '#d32f2f'; textColor = 'white'; }
        else if (trueColor === 'neutral') { cardColor = '#bdbdbd'; textColor = 'black'; }
        else { cardColor = '#FFFACD'; textColor = 'black'; } // Player's key for other/team cards
      }
    } else if (myRole === 'spectator') {
      // Spectators only see colors of revealed cards
      if (revealedCards[index]) {
        if (revealedCards[index] === 'green') { cardColor = '#7cb342'; textColor = 'white'; }
        else if (revealedCards[index] === 'assassin') { cardColor = '#d32f2f'; textColor = 'white'; }
        else if (revealedCards[index] === 'neutral') { cardColor = '#bdbdbd'; textColor = 'black'; }
        else { cardColor = '#FFFACD'; textColor = 'black'; } // Revealed team/other color
      }
      // else: unrevealed cards remain default for spectator
    }

    // Apply clickable styling for the active guesser on unrevealed cards
    if (myRole === 'guesser' && isCurrentGuesser && isGuessingActive && !revealedCards[index]) {
      cursorStyle = 'pointer';
      borderStyle = '2px solid #2196f3'; // Blue outline to indicate clickable
    }

    return { 
      ...baseStyle, 
      backgroundColor: cardColor,
      color: textColor,
      cursor: cursorStyle,
      border: borderStyle
    };
  };
  
  // Function to handle card click
  const handleWordClick = (index: number) => {
    if (isCurrentGuesser && isGuessingActive && !revealedCards[index]) {
      onWordClick(index);
    }
  };
  
  if (!words || words.length === 0) {
    console.log('No words received in WordGrid component');
    return (
      <div style={styles.loadingContainer}>
        <SpinnerAnimation />
        <div style={styles.loadingText}>Loading words from server...</div>
        <div style={styles.loadingSpinner}></div>
      </div>
    );
  }

  return (
    <div>
      {/* Main Word Grid */}
      <div style={styles.gridContainer}>
        {words.map((word, index) => (
          <div
            key={index}
            style={getCardStyle(index)}
            onClick={() => handleWordClick(index)}
          >
            {word}
          </div>
        ))}
      </div>
    </div>
  );
};

// Basic styling - can be moved to a CSS file later
const styles: { [key: string]: React.CSSProperties } = {
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '10px',
    maxWidth: '600px',
  },
  gridTile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60px',
    backgroundColor: '#f5f5f5',
    padding: '10px',
    borderRadius: '5px',
    cursor: 'default',
    textAlign: 'center' as const,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    userSelect: 'none' as const,
    fontWeight: 'bold' as const,
  },
  keyCardIndicator: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '2px',
    marginBottom: '10px',
  },
  keyCardTile: {
    width: '100%',
    height: '100%',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: '2px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '30px',
    width: '250px',
    height: '150px',
    backgroundColor: '#f0f4f8',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
  },
  loadingText: {
    padding: '10px',
    textAlign: 'center' as const,
    fontSize: '1.2em',
    color: '#555',
    marginBottom: '15px',
  },
  errorText: {
    textAlign: 'center',
    fontSize: '1.2em',
    padding: '20px',
    color: 'red',
  },
  loadingSpinner: {
    width: '30px',
    height: '30px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  }
};

export default WordGrid;
