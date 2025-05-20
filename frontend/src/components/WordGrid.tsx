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
  // Helper function to get icon for card type
  const getIconForCardType = (cardType: string): string | null => {
    switch (cardType) {
      case 'green': return '✅';
      case 'assassin': return '💀';
      case 'neutral': return '➖';
      default: return '❓'; // Should ideally not happen
    }
  };

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

    // ---- START: Updated logic for Flipped Card Appearance ----
    if (revealedCards[index]) {
      // For revealed cards, set a generic 'flipped' background and hide original text.
      // The icon will be rendered separately in the JSX.
      cardColor = '#E0E0E0'; // A generic 'flipped' light grey color
      textColor = '#E0E0E0'; // Make text same color as background to effectively hide it
      // If you want revealed cards to still show their team color subtly under the icon:
      // switch (revealedCards[index]) {
      //   case 'green': cardColor = '#a5d6a7'; break; // Lighter green
      //   case 'assassin': cardColor = '#ef9a9a'; break; // Lighter red
      //   case 'neutral': cardColor = '#cfd8dc'; break; // Lighter neutral
      //   default: cardColor = '#E0E0E0'; break;
      // }
    }
    // ---- END: Updated logic for Flipped Card Appearance ----

    // Apply clickable styling for the active guesser on unrevealed cards
    if (myRole === 'guesser' && isCurrentGuesser && isGuessingActive && !revealedCards[index]) {
      cursorStyle = 'pointer';
      borderStyle = '2px solid #2196f3'; // Blue outline to indicate clickable
    }

    // ADD THIS DEBUG LOG (EXAMPLE FOR INDEX 19)
    if (index === 19) { // You can change this index or make it log for all
        console.log(`WordGrid Card Index ${index}: revealed='${revealedCards[index]}', computed cardColor='${cardColor}', myRole='${myRole}', keyCard[${index}]='${keyCard[index]}'`);
    }
    
    return { 
      ...baseStyle, 
      backgroundColor: cardColor,
      color: textColor,
      cursor: cursorStyle,
      border: borderStyle,
      // Ensure text for icon is visible if textColor was set to match cardColor for hiding word
      // We can set a specific color for icons if needed, or ensure icons are distinguishable
      // For simplicity, if icons are emojis, they often have their own color.
      // If textColor is the same as cardColor (to hide the word), icons might need explicit styling if they are text-based.
      // However, emojis usually render fine.
      display: 'flex',        // Keep flex for centering content (icon or word)
      alignItems: 'center',
      justifyContent: 'center'
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
            style={getCardStyle(index)} // getCardStyle now includes icon info via data attributes or can return more complex object
            onClick={() => handleWordClick(index)}
          >
            {/* Conditionally render word or icon based on revealed state */}
            {revealedCards[index] 
              ? <span style={{ fontSize: '1.5em' }}>{getIconForCardType(revealedCards[index])}</span> // Display icon if revealed
              : word // Display word if not revealed
            }
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
