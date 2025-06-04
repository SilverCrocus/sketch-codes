import React from 'react';
import duckIconUrl from '../assets/small-duck.svg';
import starIconUrl from '../assets/star-small.svg';

interface CardRevealStatus {
  revealed_by_guesser_for_a: string | null;
  revealed_by_guesser_for_b: string | null;
}

interface WordGridProps {
  gridWords: string[];
  gridRevealStatus: CardRevealStatus[];
  onCardClick: (index: number) => void;
  myRole: 'drawer' | 'guesser' | 'spectator' | 'connecting';
  activeClueGiverPerspective: 'a' | 'b' | null;
  isGuessingActive: boolean;
  playerKeyCard: string[]; // Keycard for the current player's perspective
}

// Add CSS animation for the spinner
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
  gridWords, 
  gridRevealStatus,
  onCardClick, 
  myRole,
  activeClueGiverPerspective,
  isGuessingActive,
  playerKeyCard // Destructure the new prop
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

  const getEffectiveCardTypeForDisplay = (index: number): string | null => {
    const status = gridRevealStatus[index];
    if (!status) return null;

    if (status.revealed_by_guesser_for_a === 'assassin' || status.revealed_by_guesser_for_b === 'assassin') {
      return 'assassin';
    }
    if (status.revealed_by_guesser_for_a === 'green' || status.revealed_by_guesser_for_b === 'green') {
      return 'green'; // Show combined green for win condition clarity
    }
    
    // If not a game-ending assassin or team-wide green, show based on active clue giver's reveal
    if (activeClueGiverPerspective === 'a' && status.revealed_by_guesser_for_a) {
      return status.revealed_by_guesser_for_a;
    }
    if (activeClueGiverPerspective === 'b' && status.revealed_by_guesser_for_b) {
      return status.revealed_by_guesser_for_b;
    }
    return null; // Not revealed in a way that changes display from keycard
  };

  const isCardClickable = (idx: number): boolean => {
    if (!isGuessingActive || myRole !== 'guesser' || !activeClueGiverPerspective) {
      return false;
    }
    const status = gridRevealStatus[idx];
    if (!status) return false;

    // Cannot click if it's an assassin for anyone (game would have ended or card permanently dead)
    if (status.revealed_by_guesser_for_a === 'assassin' || status.revealed_by_guesser_for_b === 'assassin') {
      return false;
    }

    // Clickable if not yet revealed from the perspective of the current clue giver
    if (activeClueGiverPerspective === 'a') {
      return status.revealed_by_guesser_for_a === null;
    }
    if (activeClueGiverPerspective === 'b') {
      return status.revealed_by_guesser_for_b === null;
    }
    return false;
  };

  // Helper function to determine the styling for each card
  const getCardStyle = (index: number): React.CSSProperties => {
    const baseStyle = { ...styles.gridTile }; // Default style from styles object
    let cardColor = baseStyle.backgroundColor;
    let textColor = baseStyle.color || 'black';
    let cursorStyle = baseStyle.cursor;
    let borderStyle = baseStyle.border;

    const effectiveType = getEffectiveCardTypeForDisplay(index);

    if (effectiveType === 'green' || effectiveType === 'assassin') {
      // Card is fully revealed as green (for a team) or assassin
      cardColor = '#E0E0E0'; // Light grey for revealed cards
      textColor = '#E0E0E0'; // Hide word text, as icon will be shown
    } else if (effectiveType === 'neutral') {
      // Card was revealed as neutral by a guesser
      cardColor = '#cfd8dc'; // A distinct neutral revealed color (e.g., blue-grey)
      textColor = 'black';    // Ensure word text is visible
    } else {
      // Card not effectively revealed for display (effectiveType is null), show its keyCard color
      if (playerKeyCard && playerKeyCard.length > index) {
        const playerPerspectiveColor = playerKeyCard[index];
        switch (playerPerspectiveColor) {
          case 'green': cardColor = '#7cb342'; textColor = 'white'; break;
          case 'assassin': cardColor = '#d32f2f'; textColor = 'white'; break;
          case 'neutral': cardColor = '#bdbdbd'; textColor = 'black'; break;
          default: cardColor = '#FFFACD'; textColor = 'black'; break;
        }
      } else {
        cardColor = '#FFFACD'; textColor = 'black';
      }
    }

    // Override cursor and border for clickable cards
    if (isCardClickable(index)) {
      cursorStyle = 'pointer';
      borderStyle = '2px solid #2196f3'; // Blue outline to indicate clickable
    }
    
    return { 
      ...baseStyle, 
      position: 'relative', // Explicitly ensure this for token positioning
      backgroundColor: cardColor,
      color: textColor,
      cursor: cursorStyle,
      border: borderStyle,
      display: 'flex',        // Keep flex for centering content (icon or word)
      alignItems: 'center',
      justifyContent: 'center'
    };
  };
  
  // Function to handle card click
  const handleWordClick = (index: number) => {
    if (isCardClickable(index)) {
      onCardClick(index);
    }
  };
  
  if (!gridWords || gridWords.length === 0) {
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
      <style>
        {`
          .card-tokens-container-class {
            position: absolute;
            bottom: 2px; /* Reposition to bottom */
            left: 2px;   /* Reposition to left */
            z-index: 1;
            display: flex;
            gap: 2px;
          }
          .token-image {
            width: 18px; /* Adjust size as needed */
            height: 18px; /* Adjust size as needed */
          }
          .red-duck {
            /* Example filter for red - tune in browser dev tools if needed */
            filter: brightness(0) saturate(100%) invert(30%) sepia(90%) saturate(5000%) hue-rotate(350deg) brightness(100%) contrast(100%);
          }
          .blue-duck {
            /* Example filter for blue - tune in browser dev tools if needed */
            filter: brightness(0) saturate(100%) invert(50%) sepia(80%) saturate(5000%) hue-rotate(190deg) brightness(100%) contrast(100%);
          }
        `}
      </style>
      {/* Main Word Grid */}
      <div style={styles.gridContainer}>
        {gridWords.map((word, index) => {
          const cardStatus = gridRevealStatus[index];
          let showDuckToken = false;
          let showStarToken = false;

          const effectiveType = getEffectiveCardTypeForDisplay(index);

          // Only show tokens if the card is not yet revealed as green or assassin
          if (cardStatus && effectiveType !== 'green' && effectiveType !== 'assassin') {
            if (cardStatus.revealed_by_guesser_for_a === 'neutral') {
              showDuckToken = true; // Player A's team made an incorrect guess (neutral)
            }
            if (cardStatus.revealed_by_guesser_for_b === 'neutral') {
              showStarToken = true; // Player B's team made an incorrect guess (neutral)
            }
          }

          // Log for debugging token display
          // console.log(
          //   `[WordGrid Card ${index}] Word: ${word}, Status:`, cardStatus, 
          //   `EffectiveType: ${effectiveType}, Duck: ${showDuckToken}, Star: ${showStarToken}`
          // );

          return (
            <div
              key={index}
              className="word-card" // Ensure this class is present for CSS targeting
              style={getCardStyle(index)} 
              onClick={() => handleWordClick(index)}
            >
              {/* Main card type icon (green/assassin) or word text */}
              {effectiveType && (effectiveType === 'green' || effectiveType === 'assassin') ? (
                <span className="card-type-icon" style={{ fontSize: '1.5em' }}>{getIconForCardType(effectiveType)}</span>
              ) : (
                <span className="word-text">{word.toUpperCase()}</span>
              )}

              {/* Tokens container */}
              <div className="card-tokens-container-class">
                {showDuckToken && <img src={duckIconUrl} alt="Red Duck Token" className="token-image red-duck" />}
                {showStarToken && <img src={duckIconUrl} alt="Blue Duck Token" className="token-image blue-duck" />}{/* Using duckIconUrl for blue duck too */}
              </div>
            </div>
          );
        })}
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
    position: 'relative', // Added for positioning context of tokens
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
