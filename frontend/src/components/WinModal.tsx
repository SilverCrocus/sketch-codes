import React from 'react';
import { PlayerType } from '../types/game'; // Import PlayerType

interface WinModalProps {
  isOpen: boolean;
  onClose: () => void;
  winner: string | null; // 'a', 'b', or null if no one/draw (though game logic implies a winner)
  playerType: PlayerType; // To know if the current player is part of the winning team
  onRestart: () => void;
  onExit: () => void;
}

const WinModal: React.FC<WinModalProps> = ({
  isOpen,
  onClose,
  winner,
  playerType,
  onRestart,
  onExit,
}) => {
  if (!isOpen) return null;

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'white',
    padding: '30px 50px',
    borderRadius: '10px',
    boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
    zIndex: 1000,
    textAlign: 'center',
  };

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999,
  };

  const buttonStyle: React.CSSProperties = {
    marginTop: '20px',
    padding: '10px 20px',
    fontSize: '1em',
    cursor: 'pointer',
  };

  return (
    <>
      <div
        style={backdropStyle}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClose();
          }
        }}
        role="button"
        tabIndex={0}
      ></div>
      <div style={modalStyle}>
        <h2>Game Over!</h2>
        {winner ? (
          <p>
            {winner === playerType
              ? 'Congratulations, your team won!'
              : `Team ${winner.toUpperCase()} won!`}
          </p>
        ) : (
          <p>The game ended.</p> // Fallback, though a winner should always be set
        )}
        <div style={{ marginTop: '20px' }}>
          <button style={{ ...buttonStyle, marginRight: '10px' }} onClick={onRestart}>
            Play Again
          </button>
          <button style={buttonStyle} onClick={onExit}>
            Exit to Lobby
          </button>
        </div>
      </div>
    </>
  );
};

export default WinModal;
