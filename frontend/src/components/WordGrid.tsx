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

    if (effectiveType) {
      // Card has been revealed in some capacity (assassin, green for team, or by current clue giver)
      // Use a generic 'flipped' background, icon will show the type.
      cardColor = '#E0E0E0'; // Light grey for revealed cards
      textColor = '#E0E0E0'; // Hide word text
      // Optionally, tint background based on effectiveType if desired:
      // switch (effectiveType) {
      //   case 'green': cardColor = '#a5d6a7'; break; 
      //   case 'assassin': cardColor = '#ef9a9a'; break; 
      //   case 'neutral': cardColor = '#cfd8dc'; break;
      // }
    } else {
      // Card not effectively revealed for display purposes; show its keyCard color for the current player
      if (playerKeyCard && playerKeyCard.length > index) {
        const playerPerspectiveColor = playerKeyCard[index];
        switch (playerPerspectiveColor) {
          case 'green': cardColor = '#7cb342'; textColor = 'white'; break; // Player's agent
          case 'assassin': cardColor = '#d32f2f'; textColor = 'white'; break; // Player's assassin (or shared assassin)
          case 'neutral': cardColor = '#bdbdbd'; textColor = 'black'; break; // Neutral/Bystander
          // 'double_agent' on the keycard from backend should appear as 'green' for this player.
          // If the backend sends 'double_agent' directly in playerKeyCard, handle it here or ensure backend translates.
          default: cardColor = '#FFFACD'; textColor = 'black'; break; // Default bystander/unassigned
        }
      } else {
        // Fallback if playerKeyCard is not available or index is out of bounds
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
      {/* Main Word Grid */}
      <div style={styles.gridContainer}>
        {gridWords.map((word, index) => {
          const cardStatus = gridRevealStatus[index];
          let tokenUrl = null;

          if (cardStatus) {
            if (cardStatus.revealed_by_guesser_for_a) {
              tokenUrl = duckIconUrl; // Player A's turn revealed this
            } else if (cardStatus.revealed_by_guesser_for_b) {
              tokenUrl = starIconUrl; // Player B's turn revealed this
            }
          }

          // Log for debugging token display
          console.log(
            `[WordGrid Card ${index}] Status:`, cardStatus, 
            `ActivePerspective: ${activeClueGiverPerspective}`, 
            `TokenURL: ${tokenUrl}`
          );

          return (
            <div
              key={index}
              className="word-card" // Ensure this class is present for CSS targeting
              style={getCardStyle(index)} 
              onClick={() => handleWordClick(index)}
            >
              {/* Original logic for main card type icon - assuming these helper functions exist */}
              {(() => {
                const effectiveType = getEffectiveCardTypeForDisplay(index);
                if (effectiveType) {
                  return <span className="card-type-icon" style={{ fontSize: '1.5em' }}>{getIconForCardType(effectiveType)}</span>;
                }
                return null;
              })()}

              {/* Word text */}
              <span className="word-text">{word.toUpperCase()}</span>

              {/* New SVG Token for clicked status */}
              {tokenUrl && <img src={tokenUrl} alt="token" className="clicked-svg-token" />}
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
